-- ============================================================================
-- nutrition_coach_edits_migration.sql
-- Coach add/remove foods on an ASSIGNED plan (client_nutrition_enrollments →
-- nutrition_assignments). Additive: one RPC + privilege grants. No table,
-- RLS, or existing-function changes. Idempotent: safe to run multiple times.
-- NOT APPLIED YET — run in the Supabase SQL Editor after owner approval.
--
-- Design (locked):
--   * Add    → new nutrition_assignment_foods row, original_* = current_* =
--              values at add time, change_type = 'addition',
--              template_food_id = NULL (not from the template). The
--              'addition' tag also exempts the row from regeneration
--              pruning (which deletes only change_type IS NULL rows).
--   * Remove → row kept, change_type = 'removal', current_quantity = 0,
--              current_* zeroed; original_* stays frozen. History remains
--              queryable and the row survives regeneration.
--   * Every edit appends a nutrition_change_log row with
--     source = 'coach_dashboard' (existing CHECK values 'addition' /
--     'removal' are reused — no constraint changes needed).
--   * Edit window: blocked on completed meals and past dates; allowed on
--     future dates and today's still-assigned meals. Skipped meals are
--     editable (coach override). Enrollment must be active.
-- ============================================================================

create or replace function public.apply_coach_meal_edit(
  p_assignment_id uuid,
  p_action text,          -- 'add' | 'remove'
  p_food_id uuid,         -- required for 'add'
  p_quantity numeric,     -- required for 'add'
  p_assignment_food_id uuid, -- required for 'remove'
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment nutrition_assignments;
  v_enrollment client_nutrition_enrollments;
  v_base record;
  v_basis numeric;
  v_food_row nutrition_assignment_foods;
  v_max_order int;
  v_new_id uuid;
  v_log_id uuid;
begin
  if p_action <> 'add' and p_action <> 'remove' then
    raise exception 'Action must be add or remove';
  end if;

  select * into v_assignment from nutrition_assignments where id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'Meal not found';
  end if;

  -- Defense in depth: direct JWT callers must own the coach row.
  -- service_role calls skip this (the API route already verified ownership).
  if auth.role() <> 'service_role' then
    if not exists (
      select 1 from coaches
      where id = v_assignment.coach_id and user_id = auth.uid()
    ) then
      raise exception 'Not authorized for this coach';
    end if;
  end if;

  select * into v_enrollment
  from client_nutrition_enrollments where id = v_assignment.enrollment_id;
  if v_enrollment.id is null or v_enrollment.status <> 'active' then
    raise exception 'Edits are allowed only on active enrollments';
  end if;
  if v_assignment.status = 'completed' then
    raise exception 'Completed meals cannot be edited';
  end if;
  if v_assignment.scheduled_date < current_date then
    raise exception 'Past meals cannot be edited';
  end if;

  if p_action = 'add' then
    if p_food_id is null then raise exception 'Food is required'; end if;
    if p_quantity is null or p_quantity <= 0 then
      raise exception 'Quantity must be greater than 0';
    end if;
    select serving_size, serving_unit, name,
           calories, protein_g, carbs_g, fat_g
    into v_base from foods where id = p_food_id;
    if v_base.serving_size is null then raise exception 'Food not found'; end if;
    v_basis := nullif(v_base.serving_size, 0);
    if v_basis is null then v_basis := 1; end if;

    select coalesce(max(order_index), -1) + 1 into v_max_order
    from nutrition_assignment_foods where assignment_id = p_assignment_id;

    insert into nutrition_assignment_foods
      (assignment_id, template_food_id, food_id, food_name, serving_unit, serving_size,
       original_quantity, original_calories, original_protein_g, original_carbs_g, original_fat_g,
       current_quantity, current_calories, current_protein_g, current_carbs_g, current_fat_g,
       current_food_id, change_type, changed_at, order_index)
    values
      (p_assignment_id, null, p_food_id, v_base.name, v_base.serving_unit, v_base.serving_size,
       p_quantity,
       round(v_base.calories * p_quantity / v_basis),
       round((v_base.protein_g * p_quantity / v_basis)::numeric, 1),
       round((v_base.carbs_g * p_quantity / v_basis)::numeric, 1),
       round((v_base.fat_g * p_quantity / v_basis)::numeric, 1),
       p_food_id,
       round(v_base.calories * p_quantity / v_basis),
       round((v_base.protein_g * p_quantity / v_basis)::numeric, 1),
       round((v_base.carbs_g * p_quantity / v_basis)::numeric, 1),
       round((v_base.fat_g * p_quantity / v_basis)::numeric, 1),
       p_food_id, 'addition', now(), v_max_order)
    returning id into v_new_id;

    insert into nutrition_change_log
      (assignment_id, assignment_food_id, enrollment_id, coach_id, client_id,
       plan_date, meal_name, change_type,
       original_food_id, original_food_name, original_quantity,
       new_food_id, new_food_name, new_quantity,
       source, note)
    values
      (p_assignment_id, v_new_id, v_assignment.enrollment_id, v_assignment.coach_id,
       v_assignment.client_id, v_assignment.scheduled_date, v_assignment.meal_name, 'addition',
       null, null, null,
       p_food_id, v_base.name, p_quantity,
       'coach_dashboard', nullif(p_note, ''));
    return v_new_id;
  else
    if p_assignment_food_id is null then raise exception 'Food item is required'; end if;
    select * into v_food_row
    from nutrition_assignment_foods
    where id = p_assignment_food_id and assignment_id = p_assignment_id;
    if v_food_row.id is null then
      raise exception 'Food item not found in this meal';
    end if;
    if v_food_row.change_type = 'removal' then
      raise exception 'Food is already removed';
    end if;

    update nutrition_assignment_foods
    set change_type = 'removal',
        current_quantity = 0,
        current_calories = 0,
        current_protein_g = 0,
        current_carbs_g = 0,
        current_fat_g = 0,
        changed_at = now()
    where id = p_assignment_food_id;

    insert into nutrition_change_log
      (assignment_id, assignment_food_id, enrollment_id, coach_id, client_id,
       plan_date, meal_name, change_type,
       original_food_id, original_food_name, original_quantity,
       new_food_id, new_food_name, new_quantity,
       source, note)
    values
      (p_assignment_id, p_assignment_food_id, v_assignment.enrollment_id, v_assignment.coach_id,
       v_assignment.client_id, v_assignment.scheduled_date, v_assignment.meal_name, 'removal',
       v_food_row.food_id, v_food_row.food_name, v_food_row.original_quantity,
       null, null, null,
       'coach_dashboard', nullif(p_note, ''))
    returning id into v_log_id;
    return v_log_id;
  end if;
end;
$$;

-- Least privilege: same pattern as the other nutrition RPCs.
revoke all on function public.apply_coach_meal_edit(uuid, text, uuid, numeric, uuid, text) from public, anon;
grant execute on function public.apply_coach_meal_edit(uuid, text, uuid, numeric, uuid, text) to authenticated, service_role;
