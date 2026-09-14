# CoreGym Coach Dashboard — Project Summary

Last updated: 2026-09-15.

The Coach Dashboard is the web side of the CoreGym product: coaches manage
their clients, revenue, chat — and, as of the two features documented here, a
complete **Workout Management System** with a **recurring weekly Programs**
extension. Clients train in the CoreGym Flutter mobile app against the same
Supabase database; the dashboard never writes mobile-side data and the mobile
app never changes for dashboard features.

- **Stack**: Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS 4 ·
  shadcn/base-ui · Supabase (shared live project `mkrjvrnysuvtokqkyoll`) ·
  Stripe (test-mode) · Vercel.
- **Repo layout**: this app lives in `coregym-coach-dashboard/`; SQL migrations
  in `coregym-coach-dashboard/supabase/`; docs in
  `coregym-coach-dashboard/docs/`.
- **Companion doc**: `docs/coach-weekly-programs.md` — deep-dive on the
  Programs feature (date math, RPC behavior, manual test walkthrough).

Status notation below is deliberate: **verified** means it was actually
executed and observed working (build, tests, or in a browser); **built,
pending migration** means the code exists and is type-checked but the required
SQL has not been applied to the live database yet, so the live path could not
be exercised end-to-end.

---

## 1. Workout Management System

### What it does

Closes the coaching loop:

```
Coach builds a reusable Workout Template (name, target muscles, exercises
with target sets/reps/weight/rest/notes, persisted order)
      ↓
Coach assigns a template to an ACTIVE subscriber for a date
      ↓
Client trains in the mobile app; the app links the executed session via
workout_sessions.assignment_id and logs workout_sets
      ↓
Coach reviews target-vs-actual per set (best weight, volume, completion,
warmup separation, client notes), sees weekly volume and PRs
      ↓
Coach sends feedback through the existing chat and/or duplicates the
workout as an editable "next workout" — the original template is never
mutated by client performance
```

### Database objects (migration: `supabase/workout_templates_migration.sql`)

- **`workout_templates`** — `id`, `coach_id → coaches.id` (never the auth uid),
  `name`, `target_muscles text[]`, `notes`, timestamps. `updated_at` maintained
  by trigger (`wt_touch_updated_at`).
- **`workout_template_exercises`** — `template_id` (FK, cascade), `exercise_name`,
  `target_sets`, `target_reps`, `target_weight_kg`, `rest_sec`, `notes`,
  `order_index`.
- **`workout_assignments`** — `template_id`, `coach_id → coaches.id`,
  `client_id` (= `profiles.id`), `program_id` (reserved for the app's
  `training_programs` catalog — left `null` except explicit program links),
  `scheduled_date` (date-only), `status` (`assigned | started | completed |
  skipped`).
- **`workout_sessions.assignment_id`** (new nullable column) — the
  integration point the mobile app sets when a client starts an assigned
  workout; the dashboard reads it, never writes it.
- **RPCs** (SECURITY DEFINER, called by server routes after auth + ownership
  checks): `create_workout_template_atomic(p_coach_id, p_name, p_target_muscles,
  p_notes, p_exercises jsonb)` and `update_workout_template_atomic(...)` —
  template + exercise rows commit together or not at all.
- **RLS**: `wt_coach_all` / `wte_coach_all` (coach CRUD via
  `coaches.user_id = auth.uid()`), `wt_client_read` / `wte_client_read`
  (clients read templates only through an assignment referencing them),
  `wa_coach_all` (coach CRUD on own assignments), `wa_client_read` +
  `wa_client_update` (clients read own rows; table-level UPDATE is revoked and
  re-granted for the `status` column only, so clients can advance status but
  change nothing else).
- Indexes on coach/client/template/assignment lookup paths.

### API routes (all: authenticate → `resolveCoachId` → validate → service-role write)

- `POST/PATCH/DELETE /api/workout-templates` (+ `/[id]`, `/[id]/duplicate`) —
  CRUD; duplicate creates an independent copy ("(Copy)"); delete is refused
  (409) when assignments reference the template, to protect client history.
- `POST /api/workout-assignments` — dual mode: direct assignment
  (`template_id`, `client_id`, date-only `scheduled_date`, optional real
  `program_id`) or next-workout (`source_assignment_id` + adjusted template →
  new template + new assignment, originals untouched).
- `POST /api/workout-feedback` — inserts into the existing
  `conversations`/`messages` chat (conversation `coach_id` is the auth uid,
  matching the chat page), creating the conversation if missing; only active
  subscribers can be messaged.
- `GET /api/client-active-program` — the client's active program from the
  app's `user_active_program` → `training_programs`, for real program links.

### UI

- `/dashboard/workouts` — template library (cards: muscles, exercise count,
  Edit / Duplicate / Assign / Delete), spec-exact empty state, skeleton
  loading state; builder dialog (muscle chips + custom, ≥3 exercise rows,
  autocomplete from the real `exercises` table, order arrows, validation).
- Assign dialog — active-subscriber picker, date-only scheduler (tomorrow
  pre-filled), program-link mode.
- `/dashboard/subscribers/[id]` — new **Assigned Workouts** section
  (Upcoming / In progress / Completed / Skipped, linking to reviews) and a
  **Progress** section (30-day sessions, completed count, 8-week volume bars,
  personal records from the `personal_records` view).
- Performance review — `/dashboard/subscribers/[id]/workouts/[assignmentId]`:
  header (scheduled/completed dates, duration, status), sets-completed /
  total-volume / duration summary, per-exercise target line + actual set rows
  (best flagged), warmup sets listed separately, completion per exercise,
  client note, the "session data not available yet" state when the mobile app
  has not linked a session, PR cards, feedback box, and the **Duplicate as
  Next Workout** editor (rows pre-filled with achieved weights, editable, own
  scheduled date → Save & Assign creates a new template + assignment).

### Architectural decisions and why

- **Coach identity is `coaches.id`, not the auth uid** — the live schema keys
  plans/subscriptions/payments by `coaches.id`; everything resolves through
  `resolveCoachId()` and never trusts a browser-sent `coach_id`.
- **Service-role API routes for writes** — live RLS compares `coach_id` to
  `auth.uid()` on tables whose rows are keyed by `coaches.id`, so
  authenticated writes can't pass. Routes authenticate the user, resolve the
  coach, verify ownership, then write via the service role. RLS is never
  disabled.
- **Atomicity via SECURITY DEFINER RPCs** — PostgREST can't wrap multiple
  writes in a transaction; template + exercises (and later enrollment +
  generated assignments) commit atomically.
- **Live schema is the source of truth** — `src/lib/supabase/types.ts` is
  introspected from the live project; `supabase/schema.sql` is an unapplied
  proposal and is treated as documentation only.

### Theme (applies to the whole dashboard)

"Graphite & Soft Volt v2.1": tokens in `src/app/globals.css` (`@theme` +
`.dark`), dark mode default via `next-themes`, Poppins (Latin) + Cairo
(Arabic-ready) via `next/font/google`, lime `#B2D742` primary with `#161806`
on-primary, volt/teal/gold data-accent tokens, chart palette, sidebar active
item = lime tint + lime left indicator. **Verified rendering live** (background
`#121310`, Poppins active, active nav state correct on every page).

---

## 1b. Chat Media Parity

The dashboard chat is at full parity with the mobile app's media messaging
(`messages.type`: `text | voice | image | file`).

- **Viewing**: non-text messages render through `MediaMessage` — image
  thumbnails with a click-to-open lightbox, inline voice players with the
  duration (stored in `messages.content` as seconds, matching mobile), and
  file cards with name/size/download. The three storage buckets
  (`chat-images`, `chat-voice-notes`, `chat-files`) are **private**, so
  `POST /api/chat/attachments` mints short-lived (15-minute) signed URLs after
  verifying the caller is a participant of the message's conversation; media
  errors refetch once, then degrade to an "Attachment unavailable" chip.
- **Sending**: `POST /api/chat/upload` (multipart) authenticates the coach,
  verifies conversation participation, validates server-side, uploads to the
  same bucket/path convention the mobile app uses
  (`{conversationId}/{millis}_{name}`, voice as `{millis}_chat_voice_{millis}.{ext}`),
  inserts the `messages` row with the mobile content shapes (`""` for images,
  duration seconds for voice, `{"name","size"}` JSON for files), and updates
  the conversation preview. Composer adds image/file pickers and a
  MediaRecorder-based voice note flow.
- **Validation limits (server-side; adjustable)**: images 10 MB
  (`image/*`), voice 25 MB (`audio/*`), files 25 MB (any type except an
  executable blocklist). The storage buckets themselves have no limits —
  mobile-sent media of any size still renders fine in the dashboard.
- **Known consideration**: browser MediaRecorder produces webm/opus on
  Chrome/Edge/Firefox (Safari records mp4/m4a like the mobile app). iOS
  Flutter players may not play webm — flagged; mobile-side player support or
  server-side transcoding would close it.

## 2. Coach Weekly Programs (extension)

### What it does

Groups existing workout templates into a coach-owned weekly pattern
(e.g. Mon = Push, Wed = Pull, Fri = Leg), enrolls one client for a fixed
number of weeks, and generates **all** daily `workout_assignments` rows for
the whole duration immediately — so progress is trackable at the program level
(weeks × days grid, adherence, per-enrollment volume) without any mobile-app
change. Companion doc: `docs/coach-weekly-programs.md`.

### Database objects (migration: `supabase/coach_programs_migration.sql`; run AFTER the first migration)

- **`coach_programs`** — coach-owned weekly pattern (`name`, `description`,
  `is_active`, timestamps + trigger).
- **`coach_program_days`** — weekday → template mapping; `day_of_week` is ISO
  (1 = Monday … 7 = Sunday), `unique (program_id, day_of_week)`; a missing row
  is a rest day (never stored).
- **`client_program_enrollments`** — one client × program × `start_date` ×
  **fixed** `duration_weeks` (+ `status active/paused/cancelled/completed`).
  Fixed duration is a locked product decision.
- **`workout_assignments.enrollment_id`** and **`.week_number`** (new nullable
  columns) — the only change to an existing table; generated rows keep
  `program_id = null` (that column still means `training_programs.id`).
- **RPCs**: `upsert_coach_program_atomic` (program + days in one transaction;
  validates weekday range/duplicates and that every template belongs to the
  coach), `create_program_enrollment_atomic` (enrollment row + every generated
  assignment in one transaction), `regenerate_remaining_enrollment_assignments`
  (see below; returns the number replaced).
- **RLS**: `cp_coach_all`, `cpd_coach_all` (coach CRUD via the same
  `coaches.user_id` ownership path), `cpe_coach_all` (coach) +
  `cpe_client_read` (clients SELECT their own enrollments only; no client
  writes). `workout_assignments` policies are unchanged.

### Generation math (unit-tested)

```
scheduled_date = start_date + (w − 1) × 7 + (day_of_week − iso_weekday(start_date))
```

Week-1 edge case: a weekday earlier in the ISO week than the start date has
already passed, so its first occurrence is generated in week 2. Implemented
authoritatively in the SQL RPC and mirrored in
`src/lib/program-dates.ts` for the UI; the mirror is unit-tested in
`tests/program-dates.test.ts` (7 tests, including "start Friday → week 1 has
only Friday" and "8 weeks × 3 days = 24 rows"). Run:
`node --test tests/program-dates.test.ts`.

### "Update Remaining Weeks"

Editing a program never touches generated assignments — regeneration is
explicit, per enrollment, and atomic: delete exactly this enrollment's rows
where `status = 'assigned' AND scheduled_date > current_date`, then regenerate
from today forward with the program's **current** weekday mapping. Started /
completed / skipped and past rows are never touched. No background jobs, no
implicit regeneration. Button is enabled only while the enrollment is active
and has future assigned rows.

### UI

- `/dashboard/programs` — program library (cards show the weekday→template
  summary; Create / Edit / Enroll / Delete; delete refused while enrollments
  exist), builder dialog (Mon–Sun selects: Rest or one of the coach's own
  templates), enroll dialog (active-subscriber picker, next-Monday default
  start, weeks input, live "N workouts will be generated" count computed from
  the same unit-tested math).
- `/dashboard/subscribers/[id]` — Programs section listing enrollments with
  status badges → **Open progress**.
- `/dashboard/subscribers/[id]/programs/[enrollmentId]` — weeks × days grid
  (each cell is that week's occurrence, colored by status, clicking through to
  the performance review; not-generated week-1 slots render as dashes),
  adherence ("N / M workouts completed"), volume-by-week chart scoped to this
  enrollment's linked sessions only, and the **Update Remaining Weeks** button
  with a confirm dialog that states exactly what will be replaced.

### Architectural decisions

- Strictly **additive**: the live `training_programs` catalog and its sibling
  tables are unrelated and untouched; `workout_assignments.program_id` keeps
  its original meaning.
- **Generate everything upfront** in the enrollment transaction (locked
  decision) — no incremental generation, no background jobs.
- **Explicit regeneration only** — the coach must trigger it per enrollment;
  client history is immutable.

---

## Current status (refreshed 2026-09-15)

### Verified working (executed, observed)

- Both workout migrations **applied to the live database** (2026-09-13, via the
  Supabase Management API): 6/6 tables, all link columns, 5/5 RPCs, 11/11 RLS
  policies, triggers verified.
- Full acceptance suite passed **live**: template CRUD + duplicate/edit/delete,
  assignment with validation rejections, mobile-simulated session linked by
  `assignment_id`, performance review (exact target-vs-actual), feedback into
  the existing chat, next-workout duplication (originals untouched), PPL
  program enrollment (24 correct assignments), progress grid, week-1
  completion, program edit + "Update Remaining Weeks" regeneration (23 rows,
  completed rows preserved), protected deletes (409).
- **Chat media parity** shipped and accepted: view + send image/voice/file,
  participant-gated signed URLs, server-side limits; load test confirmed media
  renders at volume.
- **Performance fixes shipped** from the audit: #1 chat history pagination
  (verified flat at a 123-message history during the load test), #3 loading
  skeletons on four routes, #2 revenue Stripe calls parallelized.
- **50-client load test** completed and cleaned up (see
  `docs/load-test-report.md`): all scenarios 200s/zero errors, real-data
  spot-checks intact.
- `stripe_account_id` reads/writes **corrected to `coaches`** (canonical
  location) across `/api/stripe/connect`, the revenue page, the settings page,
  and `types.ts` — the Stripe Connect path is now wired to the real column.

### Remaining production blockers

1. **Credential rotation (owner action, mandatory)** — Supabase service-role +
   anon keys and the Stripe test secret are exposed in pushed git history
   (commit `46a6ee4`: `rollback/*/.env.local`, plus a hardcoded anon-key JWT in
   `rollback/originals/coregymali/lib/supabase/supabase_config.dart`). Tracking
   files were removed in `cdde65a`; the keys themselves are still active.
2. **Vercel deployment + verification (staged)** — CLI installed; blocked on a
   one-time `vercel login`. After deploy: login page + one read-only
   authenticated page verified.
3. **`plans_coach_all` RLS fix (live schema change, awaiting approval)** — the
   live policy compares `coach_id = auth.uid()` and never matches; fix exists in
   `supabase/rls_role_updates.sql` (lines 158–164). Until applied, the Plans
   page stays read-only-for-coaches via service-role writes only.
4. **Mobile assignment linking (external)** — see
   `docs/mobile-assignment-linking.md`.

### Mobile dependency

`workout_sessions.assignment_id` is written by the mobile app when a client
starts an assigned workout (column already created by migration 1). Full
handoff: `docs/mobile-assignment-linking.md`. Until it ships, completed
assigned workouts show the explicit "session data is not available yet" state
rather than performance data.

---

## Known issues

1. **`plans_coach_all` RLS policy is broken in the live DB**: it compares
   `subscription_plans.coach_id` to `auth.uid()` while rows are keyed by
   `coaches.id`, so coaches cannot SELECT their own plans through the user
   context (the dashboard writes plans via service role, so plans "vanish" on
   refresh). The fix already exists in `supabase/rls_role_updates.sql`
   (lines 158–164) — **applying it is a live schema change awaiting owner
   approval**.
2. **Credentials are committed to git history**: `rollback/current/.env.local`,
   `rollback/originals/.env.local`, and a hardcoded anon-key JWT in
   `rollback/originals/coregymali/lib/supabase/supabase_config.dart` are in
   pushed history (commit `46a6ee4`); tracking was removed in `cdde65a` but the
   keys remain active — **rotation is mandatory**, history scrub optional
   (owner decision).
3. **Lint warnings in the (uncommitted) overview WIP** (`Sidebar.tsx`
   components-in-render errors, `KpiCard`/`RetentionGaugeCard` unused vars) —
   belong to that stream, fixed when it lands.
4. **`personal_records` scale note**: the view's user filter does push down
   (verified via EXPLAIN — an earlier assumption it scanned without filtering
   was wrong), but the scan is sequential; `supabase/personal_records_index.sql`
   adds a supporting index when approved/applied.
