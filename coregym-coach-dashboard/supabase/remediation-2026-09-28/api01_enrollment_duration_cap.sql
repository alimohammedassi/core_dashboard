-- ============================================================================
-- API-01 (P1) — cap program enrollment duration at 52 weeks inside
-- create_program_enrollment_atomic (defense in depth on top of the route-level
-- cap added in this run; the RPC is the boundary that actually stops the
-- mass-insert DoS for direct RPC callers).
-- NOT APPLIED YET.
--
-- Body = the exact definition committed at b03161f
-- (supabase/coach_programs_migration.sql:291-361) with ONE added guard:
-- duration_weeks > 52 now raises. Same signature/behavior otherwise, so the
-- existing route and mobile callers are unaffected for valid values.
-- Idempotent (CREATE OR REPLACE). ROLLBACK: api01_*.rollback.sql restores the
-- original body verbatim.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_program_enrollment_atomic(
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
  v_scheduled date;
  v_iso_start int;
  w int;
begin
  -- Ownership (authenticated IDOR fix): same pattern as
  -- upsert_coach_program_atomic above.
  if auth.role() <> 'service_role' then
    if not exists (
      select 1 from coaches
      where id = p_coach_id and user_id = auth.uid()
    ) then
      raise exception 'Not authorized for this coach';
    end if;
  end if;

  -- API-01: bound the assignment fan-out. The nutrition twin
  -- (create_nutrition_enrollment_atomic) has enforced the same 1..52 cap
  -- since its introduction; this closes the workout-side gap.
  if p_duration_weeks is null or p_duration_weeks <= 0 or p_duration_weeks > 52 then
    raise exception 'Duration must be between 1 and 52 weeks';
  end if;
  if not exists (
    select 1 from coach_programs
    where id = p_program_id and coach_id = p_coach_id
  ) then
    raise exception 'Program not found or not owned by this coach';
  end if;
  if exists (
    select 1 from coach_program_days where program_id = p_program_id
  ) = false then
    raise exception 'Program has no training days configured';
  end if;

  insert into client_program_enrollments (program_id, coach_id, client_id, start_date, duration_weeks)
  values (p_program_id, p_coach_id, p_client_id, p_start_date, p_duration_weeks)
  returning id into v_enrollment_id;

  v_iso_start := extract(isodow from p_start_date)::int; -- 1 = Monday .. 7 = Sunday

  for w in 1..p_duration_weeks loop
    for v_day in
      select day_of_week, template_id
      from coach_program_days
      where program_id = p_program_id
      order by day_of_week
    loop
      if w = 1 and v_day.day_of_week < v_iso_start then
        continue; -- that weekday already passed before start_date in week 1
      end if;
      v_scheduled := p_start_date + (w - 1) * 7 + (v_day.day_of_week - v_iso_start);
      insert into workout_assignments
        (template_id, coach_id, client_id, scheduled_date, status, enrollment_id, week_number, program_id)
      values
        (v_day.template_id, p_coach_id, p_client_id, v_scheduled, 'assigned', v_enrollment_id, w, null);
    end loop;
  end loop;

  return v_enrollment_id;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.create_program_enrollment_atomic(uuid, uuid, uuid, date, int) FROM public, anon;
GRANT EXECUTE  ON FUNCTION public.create_program_enrollment_atomic(uuid, uuid, uuid, date, int) TO authenticated, service_role;
