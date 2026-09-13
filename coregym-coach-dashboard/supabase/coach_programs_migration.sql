-- ============================================================================
-- coach_programs_migration.sql
-- Coach Weekly Programs (recurring schedule) — an ADDITIVE extension to the
-- Workout Management System.
--
-- A coach groups existing workout templates into a weekly pattern
-- (coach_programs + coach_program_days), enrolls a client for a fixed number
-- of weeks (client_program_enrollments), and the system generates the daily
-- workout_assignments rows for the whole duration in one atomic operation.
--
-- DELIBERATELY SEPARATE from the global training_programs catalog
-- (training_programs / program_days / program_day_exercises / user_programs /
-- user_active_program) — nothing in those tables is touched, and
-- workout_assignments.program_id KEEPS its original meaning (training_programs).
--
-- RUN AFTER workout_templates_migration.sql (references workout_templates).
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tables
-- ----------------------------------------------------------------------------

create table if not exists public.coach_programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null
    references public.coaches(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Which template runs on which weekday. A weekday without a row is a rest
-- day — no placeholder rows. ISO convention: 1 = Monday ... 7 = Sunday.
create table if not exists public.coach_program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null
    references public.coach_programs(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  template_id uuid not null
    references public.workout_templates(id),
  order_index int not null default 0,
  unique (program_id, day_of_week)
);

-- One client, one program, one start date, one FIXED duration in weeks.
create table if not exists public.client_program_enrollments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null
    references public.coach_programs(id),
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

-- ----------------------------------------------------------------------------
-- 2) The ONLY changes to an existing table: two nullable columns on
--    workout_assignments linking generated rows back to their enrollment.
--    No other column, constraint or trigger on that table is touched.
-- ----------------------------------------------------------------------------

alter table public.workout_assignments
  add column if not exists enrollment_id uuid
    references public.client_program_enrollments(id);

alter table public.workout_assignments
  add column if not exists week_number int;
-- 1-indexed, relative to the enrollment's start_date

-- ----------------------------------------------------------------------------
-- 3) Indexes
-- ----------------------------------------------------------------------------

create index if not exists idx_cp_coach on public.coach_programs(coach_id);
create index if not exists idx_cpd_program on public.coach_program_days(program_id, day_of_week);
create index if not exists idx_cpe_coach on public.client_program_enrollments(coach_id, client_id);
create index if not exists idx_cpe_program on public.client_program_enrollments(program_id);
create index if not exists idx_wa_enrollment on public.workout_assignments(enrollment_id, week_number);

-- ----------------------------------------------------------------------------
-- 4) updated_at maintenance (self-contained, same pattern as the templates)
-- ----------------------------------------------------------------------------

create or replace function public.cp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cp_touch_updated_at on public.coach_programs;
create trigger cp_touch_updated_at
  before update on public.coach_programs
  for each row execute function public.cp_touch_updated_at();

drop trigger if exists cp_touch_updated_at on public.client_program_enrollments;
create trigger cp_touch_updated_at
  before update on public.client_program_enrollments
  for each row execute function public.cp_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 5) RLS — same conventions as the workout system: coach ownership through
--    coaches.user_id = auth.uid(); clients get read-only access to their own
--    enrollments. Generated assignments stay governed by the EXISTING
--    workout_assignments policies (the two new columns change nothing there).
-- ----------------------------------------------------------------------------

alter table public.coach_programs enable row level security;
alter table public.coach_program_days enable row level security;
alter table public.client_program_enrollments enable row level security;

-- 5a) coach_programs — coach CRUD, own rows only
drop policy if exists cp_coach_all on public.coach_programs;
create policy cp_coach_all on public.coach_programs
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

-- 5b) coach_program_days — coach CRUD through the parent program
drop policy if exists cpd_coach_all on public.coach_program_days;
create policy cpd_coach_all on public.coach_program_days
  for all to authenticated
  using (
    exists (
      select 1
      from public.coach_programs p
      join public.coaches c on c.id = p.coach_id
      where p.id = program_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.coach_programs p
      join public.coaches c on c.id = p.coach_id
      where p.id = program_id and c.user_id = auth.uid()
    )
  );

-- 5c) client_program_enrollments — coach CRUD scoped to own rows
drop policy if exists cpe_coach_all on public.client_program_enrollments;
create policy cpe_coach_all on public.client_program_enrollments
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

-- 5d) client_program_enrollments — client SELECT own only; no client writes
drop policy if exists cpe_client_read on public.client_program_enrollments;
create policy cpe_client_read on public.client_program_enrollments
  for select to authenticated
  using (client_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6) RPCs (SECURITY DEFINER) — same atomicity approach as template creation.
--    The server routes authenticate the user, resolve the coach and validate
--    ownership BEFORE calling these; the checks below are defense in depth.
-- ----------------------------------------------------------------------------

-- 6a) Create or update a Coach Program with its weekday mapping in one
--     transaction (mirrors create/update_workout_template_atomic).
create or replace function public.upsert_coach_program_atomic(
  p_program_id uuid,      -- null = create
  p_coach_id uuid,
  p_name text,
  p_description text,
  p_days jsonb            -- [{"day_of_week": 1, "template_id": "...", "order_index": 0}, ...]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_day jsonb;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Program name is required';
  end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array'
     or jsonb_array_length(p_days) = 0 then
    raise exception 'At least one weekday must have a template';
  end if;

  -- validate days: ISO 1..7, no duplicates, template must belong to this coach
  if exists (
    select 1
    from jsonb_array_elements(p_days) d
    where (d->>'day_of_week')::smallint not between 1 and 7
  ) then
    raise exception 'day_of_week must be 1 (Monday) .. 7 (Sunday)';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_days) d
    group by (d->>'day_of_week')
    having count(*) > 1
  ) then
    raise exception 'Each weekday can only appear once';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_days) d
    where not exists (
      select 1 from workout_templates t
      where t.id = (d->>'template_id')::uuid and t.coach_id = p_coach_id
    )
  ) then
    raise exception 'Every template must be one of your own workout templates';
  end if;

  if p_program_id is null then
    insert into coach_programs (coach_id, name, description)
    values (p_coach_id, p_name, p_description)
    returning id into v_program_id;
  else
    if not exists (
      select 1 from coach_programs
      where id = p_program_id and coach_id = p_coach_id
    ) then
      raise exception 'Program not found or not owned by this coach';
    end if;
    update coach_programs
    set name = p_name, description = p_description
    where id = p_program_id;
    v_program_id = p_program_id;
    delete from coach_program_days where program_id = v_program_id;
  end if;

  for v_day in select * from jsonb_array_elements(p_days) loop
    insert into coach_program_days (program_id, day_of_week, template_id, order_index)
    values (
      v_program_id,
      (v_day->>'day_of_week')::smallint,
      (v_day->>'template_id')::uuid,
      coalesce(nullif(v_day->>'order_index', '')::int, 0)
    );
  end loop;

  return v_program_id;
end;
$$;

-- 6b) Enroll a client: creates the enrollment row AND generates every
--     workout_assignments row for the whole duration in ONE transaction.
--     Week-1 edge case: a weekday earlier in the ISO week than start_date's
--     weekday has already passed relative to start_date in week 1, so its
--     first occurrence is generated in week 2 instead.
create or replace function public.create_program_enrollment_atomic(
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
  if p_duration_weeks is null or p_duration_weeks <= 0 then
    raise exception 'Duration must be a positive number of weeks';
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

-- 6c) "Update Remaining Weeks": coach-triggered regeneration. Deletes ONLY
--     this enrollment's rows that are still status='assigned' AND in the
--     future, then regenerates from today forward using the CURRENT
--     coach_program_days. Past / started / completed / skipped rows are never
--     touched. Returns the number of assignments replaced.
create or replace function public.regenerate_remaining_enrollment_assignments(
  p_enrollment_id uuid,
  p_coach_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment client_program_enrollments;
  v_day record;
  v_scheduled date;
  w int;
  v_replaced int := 0;
begin
  select * into v_enrollment
  from client_program_enrollments
  where id = p_enrollment_id and coach_id = p_coach_id;
  if v_enrollment.id is null then
    raise exception 'Enrollment not found or not owned by this coach';
  end if;
  if v_enrollment.status <> 'active' then
    raise exception 'Only active enrollments can be regenerated';
  end if;

  delete from workout_assignments
  where enrollment_id = p_enrollment_id
    and status = 'assigned'
    and scheduled_date > current_date;

  for w in 1..v_enrollment.duration_weeks loop
    for v_day in
      select day_of_week, template_id
      from coach_program_days
      where program_id = v_enrollment.program_id
      order by day_of_week
    loop
      v_scheduled := v_enrollment.start_date + (w - 1) * 7 + (v_day.day_of_week - extract(isodow from v_enrollment.start_date)::int);
      -- regeneration covers only the affected range (today forward); week-1
      -- slots before start_date are automatically excluded by this filter
      if v_scheduled <= current_date then
        continue;
      end if;
      insert into workout_assignments
        (template_id, coach_id, client_id, scheduled_date, status, enrollment_id, week_number, program_id)
      values
        (v_day.template_id, p_coach_id, v_enrollment.client_id, v_scheduled, 'assigned', p_enrollment_id, w, null);
      v_replaced := v_replaced + 1;
    end loop;
  end loop;

  return v_replaced;
end;
$$;
