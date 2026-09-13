# Coach Weekly Programs (Recurring Schedule)

An extension to the CoreGym Workout Management System. This document is the
onboarding reference — it assumes no prior context.

## What it does

A **Coach Program** lets a coach group several of their existing **Workout
Templates** into a weekly recurring schedule — for example:

```
Monday    → Push Day
Wednesday → Pull Day
Friday    → Leg Day
(Tue / Thu / Sat / Sun = rest)
```

The coach then **enrolls a client**: one start date + one fixed duration in
weeks (e.g. next Monday, 8 weeks). The system immediately generates every
daily `workout_assignments` row for the whole duration (3 per week × 8 weeks
= 24 rows), each carrying `enrollment_id` and `week_number`.

The client's mobile app needs **no changes** — a generated assignment is a
normal assignment in every way. The coach gets a **Program Progress view**:
a weeks × days status grid, an adherence count, and a volume trend scoped to
that enrollment. When the coach edits the program's weekly mapping, nothing
changes for clients until the coach explicitly presses **"Update Remaining
Weeks"** per enrollment.

## Database objects

New migration: `supabase/coach_programs_migration.sql` (run **after**
`workout_templates_migration.sql`, which it depends on). Idempotent.

| Object | Purpose |
| --- | --- |
| `coach_programs` | One coach-owned reusable weekly pattern (name, description, is_active). |
| `coach_program_days` | The weekday → template mapping. `day_of_week` is ISO (1 = Monday … 7 = Sunday), unique per program. A weekday with no row is a rest day — rest days are never stored as rows. |
| `client_program_enrollments` | One client × one program × start_date × **fixed** `duration_weeks` (+ status `active/paused/cancelled/completed`). Fixed duration is a locked product decision — there is no indefinite mode. |
| `workout_assignments.enrollment_id` (new column) | Links a generated assignment back to the enrollment that produced it. |
| `workout_assignments.week_number` (new column) | 1-indexed week relative to the enrollment's start date; drives the progress grid. |

These are the **only** changes to existing tables. `program_id` on
`workout_assignments` is deliberately **not** used by this feature and stays
`null` on generated rows (see "Relationship to training_programs" below).

RPCs (all `SECURITY DEFINER`, all called only by server routes that first
authenticate the user, resolve the coach via `resolveCoachId`, and validate
ownership):

- `upsert_coach_program_atomic(p_program_id, p_coach_id, p_name, p_description, p_days)` —
  creates or updates a program plus its weekday mapping in one transaction.
  Validates: name required, at least one training day, ISO weekday range, no
  duplicate weekdays, every template belongs to the calling coach.
- `create_program_enrollment_atomic(p_program_id, p_coach_id, p_client_id, p_start_date, p_duration_weeks)` —
  inserts the enrollment and generates **all** assignments for the whole
  duration in one transaction. If anything fails, nothing is written.
- `regenerate_remaining_enrollment_assignments(p_enrollment_id, p_coach_id)` —
  see "Update Remaining Weeks" below. Returns the number of assignments replaced.

## Date generation algorithm

All dates are date-only (`date` columns, UTC arithmetic in TypeScript) — no
timezone or browser dependence.

For week `w` from 1 to `duration_weeks`, for each training day with ISO
weekday `d`:

```
scheduled_date = start_date + (w − 1) × 7 + (d − iso_weekday(start_date))
```

`iso_weekday` is 1 = Monday … 7 = Sunday (Postgres `extract(isodow …)` /
`getUTCDay()` mapped in TS).

**Week-1 edge case:** if `d` is earlier in the ISO week than
`iso_weekday(start_date)`, that occurrence happened *before* the enrollment
starts, so week 1 skips it and the slot's first generated occurrence is in
week 2. Example: start date is a Friday, program has Mon/Wed/Fri → week 1
contains only Friday; Monday and Wednesday first appear in week 2.

This exact logic exists twice — authoritatively in the SQL RPCs, and in
TypeScript at `src/lib/program-dates.ts` (used by the UI to show the expected
workout count and build the progress grid). The TS version is unit-tested in
`tests/program-dates.test.ts`; run with `node --test tests/program-dates.test.ts`.
Keep the two implementations in sync if you ever change the math.

## "Update Remaining Weeks"

Editing a Coach Program (e.g. swapping Wednesday's template) **never**
touches already-generated assignments — not automatically, not silently.

The coach opens a client's enrollment progress page and presses **"Update
Remaining Weeks"** (only enabled while the enrollment is `active` and has
future still-`assigned` rows). One atomic RPC then:

1. Deletes exactly this enrollment's rows where
   `status = 'assigned' AND scheduled_date > current_date`
2. Regenerates assignments for the same enrollment **from today forward**
   using the program's *current* weekday mapping (any computed date ≤ today
   is skipped)
3. Never touches rows that are `started`, `completed` or `skipped`, nor any
   past row — client history is immutable

There is no background job and no implicit regeneration anywhere.

## RLS model

Same conventions as the workout system — coach ownership resolves through
`coaches.user_id = auth.uid()`:

- `coach_programs` / `coach_program_days` — coach CRUD on their own rows only
  (days ownership checked through `program_id → coach_programs.coach_id`)
- `client_program_enrollments` — coach CRUD on their own rows; clients get
  **SELECT only** on their own (`client_id = auth.uid()`); clients can never
  create, edit or regenerate an enrollment
- `workout_assignments` policies are **unchanged** — the two new columns do
  not alter who may read or write a row

## Relationship to `training_programs` — do not confuse them

The live database also contains an **older, unrelated, global program
catalog**: `training_programs`, `program_days`, `program_day_exercises`,
`user_programs`, `user_active_program`. That system belongs to the mobile
app's built-in program library and has no coach ownership. This feature
deliberately introduces **separate new tables** and does not read, write,
rename or repurpose anything from the catalog. Likewise,
`workout_assignments.program_id` already points at `training_programs.id`
from the original workout spec and keeps exactly that meaning — generated
rows carry `enrollment_id` instead. If you find yourself "reusing" one of the
catalog tables here, stop: that is a design error.

## Manual test walkthrough

1. **Workouts** → make sure you have 2–3 workout templates (e.g. Push Day,
   Pull Day, Leg Day).
2. **Programs** → **Create Program** → name it "PPL Weekly" → assign Mon /
   Wed / Fri to the three templates → Save. It appears in the library.
3. **Enroll** → pick an active subscriber → keep the pre-filled start date
   (next Monday) and 8 weeks → the dialog shows "24 workouts will be
   generated" → **Enroll client**.
4. Open the client's profile (**Subscribers** → the client) → **Programs**
   section → **Open progress** → you should see an 8 × 3 grid, all cells
   "Assigned", adherence 0 / 24.
5. Complete week 1's Push Day in the mobile app (or have it linked via
   `workout_sessions.assignment_id`) → the grid cell flips to "Completed",
   adherence and the weekly volume bar update.
6. **Programs** → Edit "PPL Weekly" → change Wednesday to a different
   template → Save. Re-open the progress page: **nothing changed** for the
   client yet.
7. On the progress page press **"Update Remaining Weeks"** → confirm → only
   future still-`assigned` rows are replaced (the toast tells you how many);
   week-1 rows and any completed/started/skipped cells are untouched.
8. Negative checks: deleting a program that has enrollments is refused;
   enrolling requires an active subscriber; a client account can read (but
   not change) only their own enrollments.
