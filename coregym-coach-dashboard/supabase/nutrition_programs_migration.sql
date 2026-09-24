-- ============================================================================
-- nutrition_programs_migration.sql
-- Nutrition / Meal Planning System — ADDITIVE extension mirroring the Coach
-- Weekly Programs architecture (coach_programs_migration.sql).
--
-- A coach groups foods from the existing global `foods` library into meals,
-- meals into weekday rows, weekdays into a reusable weekly `nutrition_programs`
-- template, enrolls a client for a fixed number of weeks
-- (`client_nutrition_enrollments`), and the system materializes every
-- prescribed meal row (`nutrition_assignments` + `nutrition_assignment_foods`)
-- for the whole duration in one atomic operation.
--
-- DELIBERATELY SEPARATE from the mobile app's free-logging tables
-- (`nutrition_logs`, `daily_summary`, `user_goals`, `food_scans`, …) — nothing
-- in those tables is touched. `foods` is read-only here (RESTRICT references).
--
-- RUN AFTER workout_templates_migration.sql + coach_programs_migration.sql.
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Template layer (coach-owned, reusable across clients)
-- ----------------------------------------------------------------------------

create table if not exists public.nutrition_programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null
    references public.coaches(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per planned weekday. A weekday without a row is a rest day —
-- no placeholder rows. ISO convention: 1 = Monday ... 7 = Sunday.
create table if not exists public.nutrition_program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null
    references public.nutrition_programs(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  notes text,
  unique (program_id, day_of_week)
);

-- Flexible meal count per day (NOT hardcoded to four). Each meal has an
-- ordered position within its day.
create table if not exists public.nutrition_program_meals (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null
    references public.nutrition_program_days(id) on delete cascade,
  name text not null,
  order_index int not null default 0
);

-- One food line inside a meal. quantity is expressed in the food's own
-- serving_unit (see public.foods.serving_size / serving_unit). Macros are
-- NEVER stored here — always derived from the live foods row at render time
-- and snapshotted only when materialized into an assignment (see §2).
-- foods rows are never deleted by this feature: RESTRICT (no cascade).
create table if not exists public.nutrition_program_foods (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null
    references public.nutrition_program_meals(id) on delete cascade,
  food_id uuid not null
    references public.foods(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  order_index int not null default 0
);

-- ----------------------------------------------------------------------------
-- 2) Assignment layer (client-specific snapshot, immutable history)
-- ----------------------------------------------------------------------------

-- One client, one program, one start date, one FIXED duration in weeks.
create table if not exists public.client_nutrition_enrollments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null
    references public.nutrition_programs(id),
  coach_id uuid not null
    references public.coaches(id),
  client_id uuid not null, -- profiles.id = auth.uid(), same as workout_assignments
  start_date date not null,
  duration_weeks int not null check (duration_weeks > 0),
  status text not null default 'active'
    check (status in ('active', 'paused', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per prescribed meal per date. meal_name is FROZEN at generation so
-- template renames never rewrite client history.
create table if not exists public.nutrition_assignments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null
    references public.client_nutrition_enrollments(id) on delete cascade,
  coach_id uuid not null
    references public.coaches(id),
  client_id uuid not null,
  scheduled_date date not null,
  week_number int, -- 1-indexed, relative to the enrollment's start_date
  program_meal_id uuid, -- provenance only, nullable
  meal_name text not null,
  order_index int not null default 0,
  status text not null default 'assigned'
    check (status in ('assigned', 'completed', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- One frozen food line per meal assignment. original_* is the prescription
-- (never updated); current_* starts as a copy and moves only via the
-- apply_nutrition_food_change RPC, which also appends to nutrition_change_log.
create table if not exists public.nutrition_assignment_foods (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null
    references public.nutrition_assignments(id) on delete cascade,
  template_food_id uuid, -- provenance only, nullable
  food_id uuid not null
    references public.foods(id) on delete restrict,
  food_name text not null, -- frozen snapshot
  serving_unit text not null, -- frozen snapshot
  serving_size numeric not null, -- frozen snapshot
  original_quantity numeric not null,
  original_calories numeric not null,
  original_protein_g numeric not null,
  original_carbs_g numeric not null,
  original_fat_g numeric not null,
  current_food_id uuid
    references public.foods(id) on delete restrict,
  current_quantity numeric,
  current_calories numeric,
  current_protein_g numeric,
  current_carbs_g numeric,
  current_fat_g numeric,
  change_type text check (change_type in ('quantity', 'substitution', 'removal', 'addition')),
  changed_at timestamptz,
  order_index int not null default 0
);

-- Append-only client change history. Rows are self-contained (denormalized
-- names) so history survives assignment regeneration. reason is only stored
-- when the mobile app sends one — never fabricated.
create table if not exists public.nutrition_change_log (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid
    references public.nutrition_assignments(id) on delete set null,
  assignment_food_id uuid,
  enrollment_id uuid
    references public.client_nutrition_enrollments(id) on delete set null,
  coach_id uuid not null
    references public.coaches(id),
  client_id uuid not null,
  plan_date date,
  meal_name text,
  change_type text not null
    check (change_type in ('quantity', 'substitution', 'removal', 'addition', 'completion')),
  original_food_id uuid,
  original_food_name text,
  original_quantity numeric,
  new_food_id uuid,
  new_food_name text,
  new_quantity numeric,
  source text not null default 'client_mobile',
  note text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3) Indexes
-- ----------------------------------------------------------------------------

create index if not exists idx_np_coach on public.nutrition_programs(coach_id);
create index if not exists idx_npd_program on public.nutrition_program_days(program_id, day_of_week);
create index if not exists idx_npm_day on public.nutrition_program_meals(day_id, order_index);
create index if not exists idx_npf_meal on public.nutrition_program_foods(meal_id, order_index);
create index if not exists idx_cne_coach on public.client_nutrition_enrollments(coach_id, client_id);
create index if not exists idx_cne_program on public.client_nutrition_enrollments(program_id);
create index if not exists idx_cne_client_status on public.client_nutrition_enrollments(client_id, status);
create index if not exists idx_na_enrollment on public.nutrition_assignments(enrollment_id, scheduled_date);
create index if not exists idx_na_client on public.nutrition_assignments(client_id, scheduled_date);
create index if not exists idx_naf_assignment on public.nutrition_assignment_foods(assignment_id, order_index);
create index if not exists idx_ncl_coach on public.nutrition_change_log(coach_id, created_at desc);
create index if not exists idx_ncl_client on public.nutrition_change_log(client_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 4) updated_at maintenance (self-contained, same pattern as the programs)
-- ----------------------------------------------------------------------------

create or replace function public.np_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists np_touch_updated_at on public.nutrition_programs;
create trigger np_touch_updated_at
  before update on public.nutrition_programs
  for each row execute function public.np_touch_updated_at();

drop trigger if exists np_touch_updated_at on public.client_nutrition_enrollments;
create trigger np_touch_updated_at
  before update on public.client_nutrition_enrollments
  for each row execute function public.np_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 5) RLS — same conventions as the workout/program system: coach ownership
--    through coaches.user_id = auth.uid(); clients get read-only access to
--    their own enrollments/assignments plus narrowly-scoped writes.
-- ----------------------------------------------------------------------------

alter table public.nutrition_programs enable row level security;
alter table public.nutrition_program_days enable row level security;
alter table public.nutrition_program_meals enable row level security;
alter table public.nutrition_program_foods enable row level security;
alter table public.client_nutrition_enrollments enable row level security;
alter table public.nutrition_assignments enable row level security;
alter table public.nutrition_assignment_foods enable row level security;
alter table public.nutrition_change_log enable row level security;

-- 5a) nutrition_programs — coach CRUD, own rows only
drop policy if exists np_coach_all on public.nutrition_programs;
create policy np_coach_all on public.nutrition_programs
  for all to authenticated
  using (
    exists (
      select 1 from public.coaches c
      where c.id = coach_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.coaches c
      where c.id = coach_id and c.user_id = auth.uid()
    )
  );

-- 5b) template children — coach CRUD through the parent program
drop policy if exists npd_coach_all on public.nutrition_program_days;
create policy npd_coach_all on public.nutrition_program_days
  for all to authenticated
  using (
    exists (
      select 1 from public.nutrition_programs p
      join public.coaches c on c.id = p.coach_id
      where p.id = program_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.nutrition_programs p
      join public.coaches c on c.id = p.coach_id
      where p.id = program_id and c.user_id = auth.uid()
    )
  );

drop policy if exists npm_coach_all on public.nutrition_program_meals;
create policy npm_coach_all on public.nutrition_program_meals
  for all to authenticated
  using (
    exists (
      select 1 from public.nutrition_program_days d
      join public.nutrition_programs p on p.id = d.program_id
      join public.coaches c on c.id = p.coach_id
      where d.id = day_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.nutrition_program_days d
      join public.nutrition_programs p on p.id = d.program_id
      join public.coaches c on c.id = p.coach_id
      where d.id = day_id and c.user_id = auth.uid()
    )
  );

drop policy if exists npf_coach_all on public.nutrition_program_foods;
create policy npf_coach_all on public.nutrition_program_foods
  for all to authenticated
  using (
    exists (
      select 1 from public.nutrition_program_meals m
      join public.nutrition_program_days d on d.id = m.day_id
      join public.nutrition_programs p on p.id = d.program_id
      join public.coaches c on c.id = p.coach_id
      where m.id = meal_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.nutrition_program_meals m
      join public.nutrition_program_days d on d.id = m.day_id
      join public.nutrition_programs p on p.id = d.program_id
      join public.coaches c on c.id = p.coach_id
      where m.id = meal_id and c.user_id = auth.uid()
    )
  );

-- 5c) client_nutrition_enrollments — coach CRUD scoped to own rows
drop policy if exists cne_coach_all on public.client_nutrition_enrollments;
create policy cne_coach_all on public.client_nutrition_enrollments
  for all to authenticated
  using (
    exists (
      select 1 from public.coaches c
      where c.id = coach_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.coaches c
      where c.id = coach_id and c.user_id = auth.uid()
    )
  );

-- 5d) client_nutrition_enrollments — client SELECT own only; no client writes
drop policy if exists cne_client_read on public.client_nutrition_enrollments;
create policy cne_client_read on public.client_nutrition_enrollments
  for select to authenticated
  using (client_id = auth.uid());

-- 5e) nutrition_assignments — coach CRUD scoped to own rows
drop policy if exists na_coach_all on public.nutrition_assignments;
create policy na_coach_all on public.nutrition_assignments
  for all to authenticated
  using (
    exists (
      select 1 from public.coaches c
      where c.id = coach_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.coaches c
      where c.id = coach_id and c.user_id = auth.uid()
    )
  );

-- 5f) nutrition_assignments — client read own assignments
drop policy if exists na_client_read on public.nutrition_assignments;
create policy na_client_read on public.nutrition_assignments
  for select to authenticated
  using (client_id = auth.uid());

-- 5g) nutrition_assignments — client may update ONLY status/completed_at.
--     RLS cannot restrict columns, so table-level UPDATE is revoked from
--     authenticated and re-granted for those columns only (same pattern as
--     workout_assignments wa_client_update).
drop policy if exists na_client_update on public.nutrition_assignments;
create policy na_client_update on public.nutrition_assignments
  for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

revoke update on table public.nutrition_assignments from authenticated;
grant update (status, completed_at) on table public.nutrition_assignments to authenticated;

-- 5h) nutrition_assignment_foods — coach CRUD scoped to own assignment
drop policy if exists naf_coach_all on public.nutrition_assignment_foods;
create policy naf_coach_all on public.nutrition_assignment_foods
  for all to authenticated
  using (
    exists (
      select 1 from public.nutrition_assignments a
      join public.coaches c on c.id = a.coach_id
      where a.id = assignment_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.nutrition_assignments a
      join public.coaches c on c.id = a.coach_id
      where a.id = assignment_id and c.user_id = auth.uid()
    )
  );

-- 5i) nutrition_assignment_foods — client read own rows only (writes go
--     through the apply_nutrition_food_change RPC, which runs as definer
--     after verifying client_id = auth.uid()).
drop policy if exists naf_client_read on public.nutrition_assignment_foods;
create policy naf_client_read on public.nutrition_assignment_foods
  for select to authenticated
  using (
    exists (
      select 1 from public.nutrition_assignments a
      where a.id = assignment_id and a.client_id = auth.uid()
    )
  );

-- 5j) nutrition_change_log — coach SELECT own clients' rows
drop policy if exists ncl_coach_read on public.nutrition_change_log;
create policy ncl_coach_read on public.nutrition_change_log
  for select to authenticated
  using (
    exists (
      select 1 from public.coaches c
      where c.id = coach_id and c.user_id = auth.uid()
    )
  );

-- 5k) nutrition_change_log — client INSERT own rows (+ SELECT own); no UPDATE/DELETE
drop policy if exists ncl_client_read on public.nutrition_change_log;
create policy ncl_client_read on public.nutrition_change_log
  for select to authenticated
  using (client_id = auth.uid());

drop policy if exists ncl_client_insert on public.nutrition_change_log;
create policy ncl_client_insert on public.nutrition_change_log
  for insert to authenticated
  with check (client_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6) RPCs (SECURITY DEFINER) — same atomicity approach as the workout/program
--    system. Server routes authenticate, resolve the coach and validate
--    ownership BEFORE calling these; checks below are defense in depth.
--
--    Nutrition scaling basis (verified against live foods data): every value
--    is stored per (serving_size × serving_unit), so
--      scaled = base × quantity / serving_size
--    with quantity expressed in the food's own serving_unit. serving_size of
--    NULL/0 is guarded to 1 to avoid divide-by-zero.
-- ----------------------------------------------------------------------------

-- 6a) Create or update a nutrition program with its full day/meal/food tree
--     in one transaction.
--     p_tree jsonb: [{day_of_week, notes, meals: [{name, foods: [{food_id, quantity}]}]}]
create or replace function public.upsert_nutrition_program_atomic(
  p_program_id uuid,      -- null = create
  p_coach_id uuid,
  p_name text,
  p_description text,
  p_tree jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_day jsonb;
  v_meal jsonb;
  v_food jsonb;
  v_day_id uuid;
  v_meal_id uuid;
  v_meal_idx int;
  v_food_idx int;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Program name is required';
  end if;
  if char_length(p_name) > 200 then
    raise exception 'Program name must be 200 characters or fewer';
  end if;
  -- Defense in depth: when invoked with a user JWT (not via the dashboard's
  -- service-role API routes), the caller must own the coach row. service_role
  -- calls skip this because the API route already authenticated + verified
  -- ownership before calling.
  if auth.role() <> 'service_role' then
    if not exists (
      select 1 from coaches where id = p_coach_id and user_id = auth.uid()
    ) then
      raise exception 'Not authorized for this coach';
    end if;
  end if;
  if p_tree is null or jsonb_typeof(p_tree) <> 'array'
     or jsonb_array_length(p_tree) = 0 then
    raise exception 'At least one day must have meals';
  end if;
  -- Payload caps: 7 weekdays is structural (unique day_of_week); cap meals
  -- per day and foods per meal so a malformed client cannot fan out rows.
  if exists (
    select 1 from jsonb_array_elements(p_tree) d
    where jsonb_array_length(coalesce(d->'meals', '[]'::jsonb)) > 20
  ) then
    raise exception 'A day can have at most 20 meals';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tree) d,
      jsonb_array_elements(coalesce(d->'meals', '[]'::jsonb)) m
    where jsonb_array_length(coalesce(m->'foods', '[]'::jsonb)) > 50
  ) then
    raise exception 'A meal can have at most 50 foods';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_tree) d
    where (d->>'day_of_week')::smallint not between 1 and 7
  ) then
    raise exception 'day_of_week must be 1 (Monday) .. 7 (Sunday)';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tree) d
    group by (d->>'day_of_week') having count(*) > 1
  ) then
    raise exception 'Each weekday can only appear once';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tree) d,
      jsonb_array_elements(coalesce(d->'meals', '[]'::jsonb)) m,
      jsonb_array_elements(coalesce(m->'foods', '[]'::jsonb)) f
    where not exists (
      select 1 from foods where id = (f->>'food_id')::uuid
    )
  ) then
    raise exception 'Every food must reference the food library';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tree) d,
      jsonb_array_elements(coalesce(d->'meals', '[]'::jsonb)) m,
      jsonb_array_elements(coalesce(m->'foods', '[]'::jsonb)) f
    where coalesce((f->>'quantity')::numeric, 0) <= 0
  ) then
    raise exception 'Every food quantity must be greater than 0';
  end if;

  if p_program_id is null then
    insert into nutrition_programs (coach_id, name, description)
    values (p_coach_id, p_name, p_description)
    returning id into v_program_id;
  else
    if not exists (
      select 1 from nutrition_programs
      where id = p_program_id and coach_id = p_coach_id
    ) then
      raise exception 'Program not found or not owned by this coach';
    end if;
    update nutrition_programs
    set name = p_name, description = p_description
    where id = p_program_id;
    v_program_id = p_program_id;
    delete from nutrition_program_days where program_id = v_program_id;
  end if;

  for v_day in select * from jsonb_array_elements(p_tree) loop
    insert into nutrition_program_days (program_id, day_of_week, notes)
    values (
      v_program_id,
      (v_day->>'day_of_week')::smallint,
      nullif(v_day->>'notes', '')
    )
    returning id into v_day_id;

    v_meal_idx := 0;
    for v_meal in select * from jsonb_array_elements(coalesce(v_day->'meals', '[]'::jsonb)) loop
      if v_meal->>'name' is null or btrim(v_meal->>'name') = '' then
        raise exception 'Every meal must have a name';
      end if;
      insert into nutrition_program_meals (day_id, name, order_index)
      values (v_day_id, btrim(v_meal->>'name'), v_meal_idx)
      returning id into v_meal_id;

      v_food_idx := 0;
      for v_food in select * from jsonb_array_elements(coalesce(v_meal->'foods', '[]'::jsonb)) loop
        insert into nutrition_program_foods (meal_id, food_id, quantity, order_index)
        values (
          v_meal_id,
          (v_food->>'food_id')::uuid,
          (v_food->>'quantity')::numeric,
          v_food_idx
        );
        v_food_idx := v_food_idx + 1;
      end loop;
      v_meal_idx := v_meal_idx + 1;
    end loop;
  end loop;

  return v_program_id;
end;
$$;

-- 6b) Enroll a client: creates the enrollment row AND materializes every
--     nutrition_assignments + nutrition_assignment_foods row for the whole
--     duration in ONE transaction, with macro snapshots computed from the
--     live foods rows. Week-1 edge case mirrors the workout system.
create or replace function public.create_nutrition_enrollment_atomic(
  p_program_id uuid,
  p_coach_id uuid,
  p_client_id uuid,
  p_start_date date,
  p_duration_weeks int
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment_id uuid;
  v_day record;
  v_meal record;
  v_food record;
  v_scheduled date;
  v_iso_start int;
  v_assignment_id uuid;
  w int;
  v_basis numeric;
begin
  if p_duration_weeks is null or p_duration_weeks <= 0 then
    raise exception 'Duration must be a positive number of weeks';
  end if;
  if p_duration_weeks > 52 then
    raise exception 'Duration must be 52 weeks or fewer';
  end if;
  if auth.role() <> 'service_role' then
    if not exists (
      select 1 from coaches where id = p_coach_id and user_id = auth.uid()
    ) then
      raise exception 'Not authorized for this coach';
    end if;
  end if;
  if not exists (
    select 1 from nutrition_programs
    where id = p_program_id and coach_id = p_coach_id
  ) then
    raise exception 'Program not found or not owned by this coach';
  end if;
  if not exists (
    select 1 from nutrition_program_days where program_id = p_program_id
  ) then
    raise exception 'Program has no days configured';
  end if;

  insert into client_nutrition_enrollments (program_id, coach_id, client_id, start_date, duration_weeks)
  values (p_program_id, p_coach_id, p_client_id, p_start_date, p_duration_weeks)
  returning id into v_enrollment_id;

  v_iso_start := extract(isodow from p_start_date)::int;

  for w in 1..p_duration_weeks loop
    for v_day in
      select id, day_of_week from nutrition_program_days
      where program_id = p_program_id order by day_of_week
    loop
      if w = 1 and v_day.day_of_week < v_iso_start then
        continue;
      end if;
      v_scheduled := p_start_date + (w - 1) * 7 + (v_day.day_of_week - v_iso_start);

      for v_meal in
        select id, name, order_index from nutrition_program_meals
        where day_id = v_day.id order by order_index
      loop
        insert into nutrition_assignments
          (enrollment_id, coach_id, client_id, scheduled_date, week_number, program_meal_id, meal_name, order_index, status)
        values
          (v_enrollment_id, p_coach_id, p_client_id, v_scheduled, w, v_meal.id, v_meal.name, v_meal.order_index, 'assigned')
        returning id into v_assignment_id;

        for v_food in
          select pf.id as template_food_id, pf.food_id, pf.quantity, pf.order_index,
                 f.name as food_name, f.serving_unit, f.serving_size,
                 f.calories, f.protein_g, f.carbs_g, f.fat_g
          from nutrition_program_foods pf
          join foods f on f.id = pf.food_id
          where pf.meal_id = v_meal.id order by pf.order_index
        loop
          v_basis := nullif(v_food.serving_size, 0);
          if v_basis is null then v_basis := 1; end if;
          insert into nutrition_assignment_foods
            (assignment_id, template_food_id, food_id, food_name, serving_unit, serving_size,
             original_quantity, original_calories, original_protein_g, original_carbs_g, original_fat_g,
             order_index)
          values
            (v_assignment_id, v_food.template_food_id, v_food.food_id, v_food.food_name,
             v_food.serving_unit, v_food.serving_size,
             v_food.quantity,
             round(v_food.calories * v_food.quantity / v_basis),
             round((v_food.protein_g * v_food.quantity / v_basis)::numeric, 1),
             round((v_food.carbs_g * v_food.quantity / v_basis)::numeric, 1),
             round((v_food.fat_g * v_food.quantity / v_basis)::numeric, 1),
             v_food.order_index);
        end loop;
      end loop;
    end loop;
  end loop;

  return v_enrollment_id;
end;
$$;

-- 6c) "Update Remaining Days": coach-triggered regeneration. Deletes ONLY
--     this enrollment's meal rows that are still status='assigned' AND in the
--     future AND have no client change, then re-materializes from today
--     forward using the CURRENT template tree. Completed/skipped/changed/past
--     rows are never touched. Returns the number of meals replaced.
create or replace function public.regenerate_remaining_nutrition_assignments(
  p_enrollment_id uuid,
  p_coach_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment client_nutrition_enrollments;
  v_day record;
  v_meal record;
  v_food record;
  v_scheduled date;
  v_assignment_id uuid;
  v_basis numeric;
  w int;
  v_replaced int := 0;
begin
  select * into v_enrollment
  from client_nutrition_enrollments
  where id = p_enrollment_id and coach_id = p_coach_id;
  if v_enrollment.id is null then
    raise exception 'Enrollment not found or not owned by this coach';
  end if;
  if v_enrollment.status <> 'active' then
    raise exception 'Only active enrollments can be regenerated';
  end if;
  if auth.role() <> 'service_role' then
    if not exists (
      select 1 from coaches where id = p_coach_id and user_id = auth.uid()
    ) then
      raise exception 'Not authorized for this coach';
    end if;
  end if;

  -- Remove only pristine future rows (assigned, future, no client change).
  delete from nutrition_assignments a
  where a.enrollment_id = p_enrollment_id
    and a.status = 'assigned'
    and a.scheduled_date > current_date
    and not exists (
      select 1 from nutrition_assignment_foods f
      where f.assignment_id = a.id and f.change_type is not null
    );

  for w in 1..v_enrollment.duration_weeks loop
    for v_day in
      select id, day_of_week from nutrition_program_days
      where program_id = v_enrollment.program_id order by day_of_week
    loop
      v_scheduled := v_enrollment.start_date + (w - 1) * 7
        + (v_day.day_of_week - extract(isodow from v_enrollment.start_date)::int);
      -- Never generate before the enrollment starts (week-1 weekdays earlier
      -- than the start weekday) and never on/past elapsed dates.
      if v_scheduled < v_enrollment.start_date then
        continue;
      end if;
      if v_scheduled <= current_date then
        continue;
      end if;
      for v_meal in
        select id, name, order_index from nutrition_program_meals
        where day_id = v_day.id order by order_index
      loop
        -- A slot whose row survived the delete (completed / skipped /
        -- changed) keeps its assignment — never duplicate.
        if exists (
          select 1 from nutrition_assignments a
          where a.enrollment_id = p_enrollment_id
            and a.scheduled_date = v_scheduled
            and a.program_meal_id = v_meal.id
        ) then
          continue;
        end if;
        insert into nutrition_assignments
          (enrollment_id, coach_id, client_id, scheduled_date, week_number, program_meal_id, meal_name, order_index, status)
        values
          (p_enrollment_id, p_coach_id, v_enrollment.client_id, v_scheduled, w, v_meal.id, v_meal.name, v_meal.order_index, 'assigned')
        returning id into v_assignment_id;
        for v_food in
          select pf.id as template_food_id, pf.food_id, pf.quantity, pf.order_index,
                 f.name as food_name, f.serving_unit, f.serving_size,
                 f.calories, f.protein_g, f.carbs_g, f.fat_g
          from nutrition_program_foods pf
          join foods f on f.id = pf.food_id
          where pf.meal_id = v_meal.id order by pf.order_index
        loop
          v_basis := nullif(v_food.serving_size, 0);
          if v_basis is null then v_basis := 1; end if;
          insert into nutrition_assignment_foods
            (assignment_id, template_food_id, food_id, food_name, serving_unit, serving_size,
             original_quantity, original_calories, original_protein_g, original_carbs_g, original_fat_g,
             order_index)
          values
            (v_assignment_id, v_food.template_food_id, v_food.food_id, v_food.food_name,
             v_food.serving_unit, v_food.serving_size,
             v_food.quantity,
             round(v_food.calories * v_food.quantity / v_basis),
             round((v_food.protein_g * v_food.quantity / v_basis)::numeric, 1),
             round((v_food.carbs_g * v_food.quantity / v_basis)::numeric, 1),
             round((v_food.fat_g * v_food.quantity / v_basis)::numeric, 1),
             v_food.order_index);
        end loop;
        v_replaced := v_replaced + 1;
      end loop;
    end loop;
  end loop;

  return v_replaced;
end;
$$;

-- 6d) Client food change: atomically updates the current_* values on one
--     assignment food row and appends a self-contained history row. Verifies
--     client_id = auth.uid() ownership internally.
--
--     NOTE on the 7-day lock below: meals older than 7 days reject changes.
--     This is a product choice — recent fueling stays editable, stale history
--     stays immutable. Change only with product approval (see audit report).
create or replace function public.apply_nutrition_food_change(
  p_assignment_food_id uuid,
  p_new_quantity numeric,
  p_new_food_id uuid,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_food nutrition_assignment_foods;
  v_assignment nutrition_assignments;
  v_new foods;
  v_base record;
  v_basis numeric;
  v_qty numeric;
  v_log_id uuid;
  v_change text;
begin
  select * into v_food from nutrition_assignment_foods where id = p_assignment_food_id;
  if v_food.id is null then
    raise exception 'Food item not found';
  end if;
  select * into v_assignment from nutrition_assignments where id = v_food.assignment_id;
  -- Explicit ownership: service_role callers (dashboard API routes) already
  -- verified the client before calling; direct JWT callers must own the row.
  -- (NULL auth.uid() under service_role never passes the <> comparison, so
  -- the check is written explicitly rather than relying on NULL semantics.)
  if auth.role() = 'service_role' then
    if v_assignment.client_id is null then
      raise exception 'Assignment has no owner';
    end if;
  elsif v_assignment.client_id is null or v_assignment.client_id <> auth.uid() then
    raise exception 'Not your nutrition plan';
  end if;
  if v_assignment.scheduled_date < current_date - interval '7 days' then
    raise exception 'This meal is locked (older than 7 days)';
  end if;

  if p_new_food_id is not null and p_new_food_id <> v_food.food_id then
    select * into v_new from foods where id = p_new_food_id;
    if v_new.id is null then raise exception 'Replacement food not found'; end if;
    v_qty := coalesce(p_new_quantity, v_food.original_quantity);
    v_basis := nullif(v_new.serving_size, 0);
    if v_basis is null then v_basis := 1; end if;
    v_change := 'substitution';
    update nutrition_assignment_foods
    set current_food_id = v_new.id,
        current_quantity = v_qty,
        current_calories = round(v_new.calories * v_qty / v_basis),
        current_protein_g = round((v_new.protein_g * v_qty / v_basis)::numeric, 1),
        current_carbs_g = round((v_new.carbs_g * v_qty / v_basis)::numeric, 1),
        current_fat_g = round((v_new.fat_g * v_qty / v_basis)::numeric, 1),
        change_type = v_change,
        changed_at = now()
    where id = p_assignment_food_id;
  elsif p_new_quantity is not null and p_new_quantity <> coalesce(v_food.current_quantity, v_food.original_quantity) then
    if p_new_quantity <= 0 then raise exception 'Quantity must be greater than 0'; end if;
    -- Recompute from the library base (effective food = substitute if any),
    -- never by scaling already-rounded snapshots (avoids compounding error).
    select serving_size, calories, protein_g, carbs_g, fat_g into v_base
    from foods where id = coalesce(v_food.current_food_id, v_food.food_id);
    if v_base.serving_size is null then raise exception 'Food basis missing'; end if;
    v_basis := nullif(v_base.serving_size, 0);
    if v_basis is null then v_basis := 1; end if;
    v_change := 'quantity';
    update nutrition_assignment_foods
    set current_food_id = coalesce(current_food_id, food_id),
        current_quantity = p_new_quantity,
        current_calories = round(v_base.calories * p_new_quantity / v_basis),
        current_protein_g = round((v_base.protein_g * p_new_quantity / v_basis)::numeric, 1),
        current_carbs_g = round((v_base.carbs_g * p_new_quantity / v_basis)::numeric, 1),
        current_fat_g = round((v_base.fat_g * p_new_quantity / v_basis)::numeric, 1),
        -- Latest change wins on the row; the full trail lives in the log.
        change_type = v_change,
        changed_at = now()
    where id = p_assignment_food_id;
  else
    raise exception 'Nothing to change';
  end if;

  insert into nutrition_change_log
    (assignment_id, assignment_food_id, enrollment_id, coach_id, client_id,
     plan_date, meal_name, change_type,
     original_food_id, original_food_name, original_quantity,
     new_food_id, new_food_name, new_quantity,
     source, note)
  values
    (v_assignment.id, v_food.id, v_assignment.enrollment_id, v_assignment.coach_id, v_assignment.client_id,
     v_assignment.scheduled_date, v_assignment.meal_name, v_change,
     v_food.food_id, v_food.food_name, v_food.original_quantity,
     coalesce(p_new_food_id, v_food.food_id),
     (select name from foods where id = coalesce(p_new_food_id, v_food.food_id)),
     coalesce(p_new_quantity, v_food.original_quantity),
     'client_mobile', nullif(p_note, ''))
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7) RPC privileges — least privilege.
--    Postgres grants EXECUTE to PUBLIC by default; locked down here so
--    anonymous callers can invoke nothing. Authenticated users may call the
--    functions directly, but every RPC verifies ownership internally (see the
--    auth.role()/auth.uid() guards above), and the dashboard routes call them
--    via service_role after their own authentication + ownership checks.
-- ----------------------------------------------------------------------------

revoke all on function public.upsert_nutrition_program_atomic(uuid, uuid, text, text, jsonb) from public, anon;
revoke all on function public.create_nutrition_enrollment_atomic(uuid, uuid, uuid, date, int) from public, anon;
revoke all on function public.regenerate_remaining_nutrition_assignments(uuid, uuid) from public, anon;
revoke all on function public.apply_nutrition_food_change(uuid, numeric, uuid, text) from public, anon;

grant execute on function public.upsert_nutrition_program_atomic(uuid, uuid, text, text, jsonb) to authenticated, service_role;
grant execute on function public.create_nutrition_enrollment_atomic(uuid, uuid, uuid, date, int) to authenticated, service_role;
grant execute on function public.regenerate_remaining_nutrition_assignments(uuid, uuid) to authenticated, service_role;
grant execute on function public.apply_nutrition_food_change(uuid, numeric, uuid, text) to authenticated, service_role;
