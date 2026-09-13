-- ============================================================================
-- workout_templates_migration.sql
-- Workout Management System: reusable templates, template exercises and
-- per-client assignments, plus the workout_sessions.assignment_id link that
-- the mobile app sets when a client starts an assigned workout.
--
-- Safe to run multiple times (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Run in the Supabase SQL Editor against the live project.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tables
-- ----------------------------------------------------------------------------

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  name text not null,
  target_muscles text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  exercise_name text not null,
  target_sets int not null default 3,
  target_reps int,
  target_weight_kg numeric,
  rest_sec int,
  notes text,
  order_index int not null default 0
);

create table if not exists public.workout_assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id),
  coach_id uuid not null references public.coaches(id),
  client_id uuid not null,
  program_id uuid null,
  scheduled_date date not null,
  status text not null default 'assigned'
    check (status in ('assigned', 'started', 'completed', 'skipped')),
  created_at timestamptz not null default now()
);

-- Integration point with the mobile app: when a client starts an assigned
-- workout the app writes workout_sessions.assignment_id. Nullable so every
-- existing and unassigned session keeps working unchanged.
alter table public.workout_sessions
  add column if not exists assignment_id uuid references public.workout_assignments(id);

-- ----------------------------------------------------------------------------
-- 2) Indexes
-- ----------------------------------------------------------------------------

create index if not exists idx_wt_coach on public.workout_templates(coach_id);
create index if not exists idx_wte_template on public.workout_template_exercises(template_id, order_index);
create index if not exists idx_wa_coach on public.workout_assignments(coach_id, scheduled_date);
create index if not exists idx_wa_client on public.workout_assignments(client_id, scheduled_date);
create index if not exists idx_wa_template on public.workout_assignments(template_id);
create index if not exists idx_ws_assignment on public.workout_sessions(assignment_id);

-- ----------------------------------------------------------------------------
-- 3) updated_at maintenance for workout_templates (self-contained)
-- ----------------------------------------------------------------------------

create or replace function public.wt_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wt_touch_updated_at on public.workout_templates;
create trigger wt_touch_updated_at
  before update on public.workout_templates
  for each row execute function public.wt_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4) RLS
--    Coach ownership path: coach_id → coaches.id → coaches.user_id = auth.uid()
--    Client path:          client_id = auth.uid() (assignments) and template
--    visibility only through an assignment referencing the template.
--    Dashboard writes go through service-role API routes that independently
--    verify authentication, resolved coach and ownership.
-- ----------------------------------------------------------------------------

alter table public.workout_templates enable row level security;
alter table public.workout_template_exercises enable row level security;
alter table public.workout_assignments enable row level security;

-- 4a) workout_templates — coach CRUD
drop policy if exists wt_coach_all on public.workout_templates;
create policy wt_coach_all on public.workout_templates
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

-- 4b) workout_templates — client read only when assigned to them
drop policy if exists wt_client_read on public.workout_templates;
create policy wt_client_read on public.workout_templates
  for select to authenticated
  using (
    exists (
      select 1 from public.workout_assignments a
      where a.template_id = id and a.client_id = auth.uid()
    )
  );

-- 4c) workout_template_exercises — coach CRUD through the parent template
drop policy if exists wte_coach_all on public.workout_template_exercises;
create policy wte_coach_all on public.workout_template_exercises
  for all to authenticated
  using (
    exists (
      select 1
      from public.workout_templates t
      join public.coaches c on c.id = t.coach_id
      where t.id = template_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.workout_templates t
      join public.coaches c on c.id = t.coach_id
      where t.id = template_id and c.user_id = auth.uid()
    )
  );

-- 4d) workout_template_exercises — client read for assigned templates
drop policy if exists wte_client_read on public.workout_template_exercises;
create policy wte_client_read on public.workout_template_exercises
  for select to authenticated
  using (
    exists (
      select 1 from public.workout_assignments a
      where a.template_id = template_id and a.client_id = auth.uid()
    )
  );

-- 4e) workout_assignments — coach CRUD (scoped to own rows)
drop policy if exists wa_coach_all on public.workout_assignments;
create policy wa_coach_all on public.workout_assignments
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

-- 4f) workout_assignments — client read own assignments
drop policy if exists wa_client_read on public.workout_assignments;
create policy wa_client_read on public.workout_assignments
  for select to authenticated
  using (client_id = auth.uid());

-- 4g) workout_assignments — client may update ONLY the status column.
--     RLS cannot restrict columns, so table-level UPDATE is revoked from
--     authenticated and re-granted for the status column only. The coach
--     dashboard writes assignments through the service role, which is not
--     affected by grants.
drop policy if exists wa_client_update on public.workout_assignments;
create policy wa_client_update on public.workout_assignments
  for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

revoke update on table public.workout_assignments from authenticated;
grant update (status) on table public.workout_assignments to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Atomic template create/update RPCs
--    The dashboard creates/edits a template plus its exercise rows as one
--    unit. PostgREST cannot wrap multiple writes in a transaction, so these
--    SECURITY DEFINER functions give the server routes a single atomic call.
--    The routes still verify authentication + ownership before calling them.
-- ----------------------------------------------------------------------------

create or replace function public.create_workout_template_atomic(
  p_coach_id uuid,
  p_name text,
  p_target_muscles text[],
  p_notes text,
  p_exercises jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
begin
  if p_exercises is null or jsonb_typeof(p_exercises) <> 'array'
     or jsonb_array_length(p_exercises) = 0 then
    raise exception 'At least one exercise is required';
  end if;

  insert into workout_templates (coach_id, name, target_muscles, notes)
  values (p_coach_id, p_name, coalesce(p_target_muscles, '{}'), p_notes)
  returning id into v_template_id;

  insert into workout_template_exercises
    (template_id, exercise_name, target_sets, target_reps, target_weight_kg, rest_sec, notes, order_index)
  select
    v_template_id,
    e->>'exercise_name',
    coalesce(nullif(e->>'target_sets', '')::int, 3),
    nullif(e->>'target_reps', '')::int,
    nullif(e->>'target_weight_kg', '')::numeric,
    nullif(e->>'rest_sec', '')::int,
    nullif(e->>'notes', ''),
    coalesce(nullif(e->>'order_index', '')::int, 0)
  from jsonb_array_elements(p_exercises) as e;

  return v_template_id;
end;
$$;

create or replace function public.update_workout_template_atomic(
  p_template_id uuid,
  p_name text,
  p_target_muscles text[],
  p_notes text,
  p_exercises jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_exercises is null or jsonb_typeof(p_exercises) <> 'array'
     or jsonb_array_length(p_exercises) = 0 then
    raise exception 'At least one exercise is required';
  end if;

  update workout_templates
  set name = p_name,
      target_muscles = coalesce(p_target_muscles, '{}'),
      notes = p_notes
  where id = p_template_id;

  delete from workout_template_exercises where template_id = p_template_id;

  insert into workout_template_exercises
    (template_id, exercise_name, target_sets, target_reps, target_weight_kg, rest_sec, notes, order_index)
  select
    p_template_id,
    e->>'exercise_name',
    coalesce(nullif(e->>'target_sets', '')::int, 3),
    nullif(e->>'target_reps', '')::int,
    nullif(e->>'target_weight_kg', '')::numeric,
    nullif(e->>'rest_sec', '')::int,
    nullif(e->>'notes', ''),
    coalesce(nullif(e->>'order_index', '')::int, 0)
  from jsonb_array_elements(p_exercises) as e;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) Realtime (optional but consistent with the app's chat publication):
--    uncomment if you want the mobile app to receive assignment changes live.
--
-- alter publication supabase_realtime add table public.workout_assignments;
-- ----------------------------------------------------------------------------
