# Mobile Integration Handoff — Assignment Linking

**Audience:** the CoreGym Flutter/mobile engineer. This is the ONE piece of the
workout loop that lives outside the dashboard repository. Nothing else is
needed from mobile for the dashboard's workout system, weekly programs, or
chat — the two apps already share the same Supabase tables.

## The gap in one sentence

When a client starts a workout that originated from a dashboard assignment, the
mobile app must write the assignment's id into `workout_sessions.assignment_id`.
That single column write is what makes the coach's performance review work.

## The chain

```text
workout_templates                      (coach builds — dashboard)
        ↓
workout_assignments                    (coach assigns — dashboard;
   id = the assignment's UUID           one row per client per scheduled date,
   status = 'assigned'                  status: assigned/started/completed/skipped)
        ↓
CLIENT MOBILE APP
        ↓
workout_sessions.assignment_id = <the assignment id>   ← THE ONLY REQUIRED WRITE
        ↓
workout_sets (session_id → the session you created)
        ↓
coach performance review (dashboard reads, never writes)
```

## What the mobile app does, concretely

1. **Reading assignments** — a client's upcoming workouts are rows in
   `workout_assignments` where `client_id = auth.uid()` (RLS already scopes
   this). Each row carries `template_id`, `scheduled_date`, `status`, and — for
   program-generated rows — `enrollment_id` and `week_number`. Treat program
   rows exactly like single assignments; there is no separate flow.
2. **When the client taps "start"** on an assigned workout: create the
   `workout_sessions` row as the app already does, and include
   `assignment_id = <that row's id>`. The column is nullable — existing manual
   workouts are unaffected.
3. **Target data for the session**: the assignment's `template_id` resolves to
   `workout_templates` + `workout_template_exercises` (target sets/reps/weight/
   rest per exercise, ordered by `order_index`). Clients can read their
   assigned templates (RLS policy `wt_client_read` grants this through the
   assignment).
4. **Logging sets**: unchanged — `workout_sets` rows with `session_id` pointing
   at the session, `exercise_name` as a plain string (the dashboard matches
   target vs actual on normalized names), `is_warmup` to separate warmups.
5. **On completion**: set the assignment's `status = 'completed'` (clients may
   UPDATE only the `status` column — enforced by RLS and a column-level grant;
   `started` is also available while in progress). The dashboard's progress
   grids and adherence use these statuses.
6. **Manually started workouts** (no assignment): leave `assignment_id` NULL.
   They still appear in the client's workout history and volume stats; they
   simply have no target-vs-actual review.
7. **If assignment_id is NULL**: the coach sees
   *"Workout session data is not available yet"* on that review — the dashboard
   never fabricates a link or performance data.

## Edge cases

- Multiple sessions with the same `assignment_id`: the dashboard reviews the
  most recent one (`started_at DESC`). Prefer one session per assignment.
- `skipped` assignments: set by the client via the same status-only update when
  the client skips; no session expected.
- Program-generated assignments also carry `week_number` (1-indexed from the
  enrollment start date) — display-only for the app; nothing to write.

## Do NOT

- Do not write to `workout_templates` / `workout_template_exercises` (the
  dashboard owns those; client performance never mutates templates).
- Do not create a second linking mechanism (e.g. matching by date/name) —
  `assignment_id` is the single source of truth.
- Do not disable or work around the assignments RLS: clients read their own
  rows and update only `status`.
