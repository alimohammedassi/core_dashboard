# CoreGym Coach Dashboard — Complete Product Workflow

Generated 2026-09-15 from the actual implementation (routes, APIs, live DB schema, RLS) — not from intent. Companion docs: `PROJECT_SUMMARY.md`, `coach-weekly-programs.md`, `mobile-assignment-linking.md`, `performance-audit.md`, `load-test-report.md`.

---

## 1. Current Architecture

```text
Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
Tailwind 4 + shadcn/base-ui, "Graphite & Soft Volt" theme (dark default)
Supabase (shared live project with the CoreGym Flutter app)
Stripe (test mode) · Vercel (deployment pending)
```

Identity rules (project-wide convention):
- Coach identity = `coaches.id`, resolved from `auth.uid()` via `resolveCoachId()` (`src/lib/coach.ts`: `coaches.user_id = auth.uid()` → `coaches.id`).
- Client identity = `profiles.id` = `auth.uid()` (profile row auto-created by a DB trigger on user creation).
- Reads use the authenticated user's client; writes that live RLS blocks go through server API routes that authenticate → resolve the coach → validate ownership → write with the service role. RLS is never disabled.

Note on working-tree state: the Overview redesign (overview components, `lib/overview.ts`, client-search/export APIs, theme/layout changes) is **uncommitted WIP**. It is documented here as it exists in the working tree, flagged where relevant. `MIGRATION_PROGRESS.md` referenced by older specs does not exist.

---

## 2. Authentication Flow

### Login (`/login`, client component)
```text
Visit /login → form (email + password)
↓ submit
supabase.auth.signInWithPassword (browser client, direct Supabase Auth)
├── error → toast "Invalid login credentials", stay on /login
└── ok → fetch profiles.role (id = user.id)
        ├── role == 'coach' → toast success → router.push("/dashboard")
        ├── role != 'coach' → supabase.auth.signOut() → toast "Access denied" → stay
        └── profile fetch fails → warning toast, still → /dashboard (dev tolerance)
```
- Session storage: `@supabase/ssr` cookies (`sb-<ref>-auth-token`), refreshed by `middleware.ts` on every request (`updateSession`).
- Expired session: middleware refreshes via refresh-token; if refresh fails the dashboard layout guard redirects to `/login`.
- **MISSING**: password reset / "forgot password" flow (no route, no UI anywhere).

### Signup (`/signup`, client component) — coach registration + onboarding in one form
```text
Fields: display name, email, password, specializations (chips), monthly price, years of experience, bio
↓ submit (password ≥ 6, client-validated)
supabase.auth.signUp({ email, password, options.data: { name, role: "coach" } })
↓
auth.users row created → DB trigger auto-creates profiles row (role from user metadata → 'coach')
↓
session returned?
├── no session (email confirmation ON in Supabase) → toast "confirm your email" → /login
└── session present → POST /api/coaches (coach onboarding, see §3) → success → /dashboard
```
- Table touched: `auth.users` (Supabase Auth), `profiles` (trigger), `coaches`, `coach_onboarding` (via API).
- Error behavior: any API failure → error toast, account exists but coach rows may be missing → the dashboard's missing-coach states engage (see §4).

### Logout
`POST /api/auth/signout` (sidebar form / mobile topbar) → Supabase signout → 303 redirect to `/login`. **COMPLETE.**

### Unauthorized / non-coach access
- `/dashboard/*` unauthenticated → dashboard layout `redirect("/login")` (middleware only refreshes sessions; the layout is the guard).
- Authenticated non-coach (profile.role set and ≠ 'coach') → "Access denied" screen with sign-out button inside the dashboard layout.
- Authenticated user with no profile row → role undefined → treated as coach (dev tolerance, `layout.tsx` logs a warning) — **RISK** note in §23.

---

## 3. Coach Onboarding

**Exists, folded into signup (single-step).** No separate onboarding route.

```text
Signup form fields
  display_name, bio, price_monthly, specialization[] (max 8), years_experience
↓ POST /api/coaches (authenticated; may only onboard SELF)
service-role writes (these tables span rows a new user can't insert under RLS):
  1. profiles.role = 'coach'
  2. coaches row (display data so the mobile app's "Find a Coach" sees them)
  3. coach_onboarding row (is_completed = true)
↓
/dashboard
```
- Collected data is exactly: display name → `profiles.name` / coaches display data; bio, price_monthly, specialization[], years_experience → `coaches`/`coach_onboarding`. No invented fields.
- Status: **COMPLETE** (single-step; a separate multi-step onboarding wizard does not exist — not marked missing since the data flow is complete).

---

## 4. Dashboard Entry

```text
Authenticated coach
↓ /dashboard (layout: src/app/(dashboard)/layout.tsx)
  1. supabase.auth.getUser() → none? redirect /login
  2. profiles.role check → non-coach? Access-denied screen
  3. Sidebar (desktop) / topbar (mobile) via <SidebarNav> (client, usePathname active states)
↓ Overview (/dashboard)
```
- Navigation: Overview, Workouts, Programs, Chat, Subscribers, Plans, Revenue, Settings + theme toggle + sign-out.
- Loading states: `loading.tsx` exists for workouts, programs, subscribers (+[id]), chat, revenue, program-progress. No `error.tsx` route boundaries anywhere (**MISSING** — failures render the default Next error screen).
- Missing coach row: `/dashboard/workouts` and `/dashboard/programs` show an explicit "Coach profile missing" card; other pages degrade to empty data via `resolveCoachId` falling back to the auth uid.

---

## 5. Overview

```text
Coach → /dashboard → resolveCoachId → getOverviewData() (lib/overview.ts, uncommitted WIP)
↓ parallel Supabase queries
subscriptions (active clients) · payment_intents (revenue, 2 queries)
conversations (unread) · messages · workout_sessions (range)
user_goals + daily_summary (per active client)
↓ aggregation (period ranges: 30d / month / 90d, prev-period deltas)
UI: KPI cards, range selector, area/bar charts (custom SVG in OverviewCharts),
    adherence gauge, AI assistant card, client table, Export CSV button
```
- Real data only; empty windows render as honest empty states.
- **INCOMPLETE (uncommitted WIP)**: `AiAssistantCard` is a decorative placeholder (explicitly labeled, no backend); client search via `/api/coach/clients/search` (live search ≥2 chars, subscription-id results) and CSV export via `/api/export/subscribers` are implemented but uncommitted; the working tree removes `recharts` from package.json while 3 committed chart files still import it — the tree does not build until the WIP is committed/resolved.
- Performance note: range queries span `daily_summary`/`messages`/`workout_sessions`; audit item #6 (post-commit review) still open.

---

## 6. Clients / Subscribers

```text
Dashboard → Subscribers (/dashboard/subscribers)
↓ server render
resolveCoachId → subscriptions (coach_id = coachId, joined plan + client profile)
↓ cards per client (status badge, plan, price)
click → Client Profile (/dashboard/subscribers/[id] — [id] is the SUBSCRIPTION id)
```
- Client set = active + historical subscribers via `subscriptions` (status enum: active/cancelled/past_due/trialing/expired/paused); coach-scoped by `coaches.id`.
- Search: **uncommitted** live search API (`/api/coach/clients/search?q=`, min 2 chars, in-memory filter, returns subscription ids).
- Pagination: **MISSING** — the list fetches all subscriber rows unbounded (audit F6, confirmed at 50 clients in the load test).
- Authorization: RLS + coach-scoped query; a coach only ever sees their subscriptions.
- Empty state: explicit "no subscribers" card. Loading state: skeleton.

---

## 7. Client Profile

`/dashboard/subscribers/[id]` (server component, ~13 queries, parallelized where possible). Sections that exist:

| Section | Source | Notes |
| --- | --- | --- |
| Identity + subscription | `subscriptions` ⊕ `subscription_plans` ⊕ `profiles` | status, plan, price, dates |
| Key stats vs goals | `daily_summary`, `user_goals`, `body_measurements` | calories/steps/workouts/weight + deltas |
| **Assigned Workouts** | `workout_assignments` (+template join) | Upcoming / In progress / Completed / Skipped; links to performance review |
| **Programs** | `client_program_enrollments` ⊕ `coach_programs` | enrollments with status; link to progress grid |
| **Progress** | `workout_sets` ⊕ `workout_sessions` ⊕ `personal_records` | 8-week volume bars, PR cards, adherence |
| Daily summaries (14d) | `daily_summary` | table |
| Nutrition logs (15) | `nutrition_logs` | table |
| Workout sessions (10) + sets | `workout_sessions` ⊕ `workout_sets` | recent sessions with set lists |
| Measurements (10) | `body_measurements` | table |

All reads coach-scoped via the subscription relationship; every section has an explicit empty state; loading skeleton streams. **COMPLETE.**

---

## 8. Workout Templates

```text
/dashboard/workouts → library (server-loaded, newest first)
↓ Create Template / Edit (dialog: TemplateBuilder)
  name (required) · target muscles (chips + custom) · notes
  exercises ≥ 1: name (autocomplete from live `exercises` catalog), target sets (>0),
  reps/weight/rest (optional), notes, order (↑/↓)
↓ POST/PATCH /api/workout-templates → requireCoachContext → validate (lib/workout-input.ts)
  → RPC create/update_workout_template_atomic (template + exercises in ONE transaction)
↓ library updates in place; empty state + skeletons + per-error toasts
```
- **Duplicate**: `POST /api/workout-templates/[id]/duplicate` → independent "(Copy)" template. **Delete**: `DELETE` → refused with 409 if any assignments reference the template (history protection).
- Authorization: service-role write only after coach resolution + ownership checks; RPC re-validates. **COMPLETE.**

---

## 9. Workout Assignment

```text
Template card → Assign → dialog
  client (active subscribers only: subscriptions.status='active' for resolved coach)
  scheduled date (date-only, tomorrow pre-filled)
  optional program link (client's active program via /api/client-active-program)
↓ POST /api/workout-assignments
  validates: template ownership, client active subscription, date format
  → service-role insert: workout_assignments {template_id, coach_id, client_id, scheduled_date, status='assigned', program_id?}
↓ client sees it in the mobile app like any assignment
```
- Statuses: `assigned → started → completed / skipped` (client updates status only, via mobile).
- Failure states: non-subscriber 400, bad date 400, foreign template 403 — all surfaced as toasts. **COMPLETE.**

---

## 10. Programs (Coach Weekly Programs — the dashboard's own system)

```text
/dashboard/programs → library of coach_programs (+ days)
↓ Create/Edit (dialog: name, description, Mon–Sun each = Rest or one of the coach's templates)
  → RPC upsert_coach_program_atomic (program + days atomic; validates weekday range,
    duplicates, template ownership, ≥1 training day)
↓ Enroll Client (dialog: active subscriber, start date pre-filled next Monday, fixed duration weeks;
  live "N workouts will be generated" count from the unit-tested date math)
  → RPC create_program_enrollment_atomic (enrollment + ALL workout_assignments for the
    duration in one transaction; week-1 edge case: weekdays before start_date begin in week 2)
↓ client's profile → Programs section → progress grid (weeks × days, statuses, adherence,
  volume scoped to the enrollment) → "Update Remaining Weeks" (explicit regeneration:
  deletes only future status='assigned' rows, re-inserts from today with the CURRENT mapping;
  started/completed/skipped/past rows never touched)
```
- Distinct from the mobile app's global `training_programs` catalog (separate tables; `workout_assignments.program_id` keeps its original meaning and stays NULL on generated rows).
- Delete program: refused 409 while enrollments exist. **COMPLETE** (migration applied, acceptance-tested; see `coach-weekly-programs.md`).
- The legacy mobile catalog tables (`training_programs`, `program_days`, `program_day_exercises`, `user_programs`, `user_active_program`) are read-only references here: `user_active_program` → `training_programs` is used only to link an assignment to a client's active app program.

---

## 11. Mobile Workout Handoff

```text
workout_assignments (dashboard)
↓ client opens it in the CoreGym Flutter app (same tables; no mobile changes needed)
client starts → mobile creates workout_sessions WITH assignment_id = assignment.id   ← external dependency
client logs workout_sets (session_id)
client finishes → assignment.status = 'completed' (client may UPDATE status only)
↓ dashboard performance review resolves assignment → session → sets automatically
```
- **BLOCKED (external)**: the mobile write of `assignment_id` is the one unshipped step — full handoff: `docs/mobile-assignment-linking.md`.
- If `assignment_id` is NULL → the dashboard shows "Workout session data is not available yet." It never fabricates a link.

---

## 12. Performance Review

`/dashboard/subscribers/[id]/workouts/[assignmentId]` (server component; service-role reads after ownership checks).

```text
assignment (coach-owned, client-matched) → template + exercises (ordered)
→ session via workout_sessions.assignment_id
→ workout_sets by session (≤1000, ordered)
per template exercise: match workout_sets.exercise_name (normalized: case/punctuation-insensitive)
  actual working sets (is_warmup = false) listed per set with best-set badge
  warmups counted and listed separately (excluded from volume)
  best weight × reps at best · total volume (Σ reps × weight) · completion = actual/target sets
session: duration (duration_min, else started_at→ended_at), client note (session.notes)
summary: sets completed / target total, total volume
```
- No linked session → honest state card: "Workout session data is not available yet."
- No fabrication anywhere; PRs shown from the `personal_records` view (template exercises first). **COMPLETE** (verified live with real set data).

---

## 13. Progress / PRs

```text
client → workout_sessions (last 56 days) → workout_sets (bulk IN query, ≤5000, warmups excluded)
↓ volume = Σ reps × weight_kg grouped by ISO week (Monday start, gaps rendered as zero)
PRs: personal_records view (DISTINCT ON user_id, exercise_name; max weight) — user filter verified
     to push down into the scan (EXPLAIN); supporting index migration written, unapplied
```
- Zero-data → "No logged volume"; single point renders as one bar. Coach scoping: the client must have a subscription with the resolved coach before any service-role read. **COMPLETE.**

---

## 14. Chat / Feedback

**Chat** (`/dashboard/chat`): server page loads conversations (`coach_id = auth uid`, ordered by `last_message_at`); `ChatClient` loads the newest 50 messages per conversation with "Load older" keyset pagination; realtime INSERT subscription (single channel per session, id-deduped); composer sends text plus **image/voice/file** via `POST /api/chat/upload` (participant check, server-side size/MIME limits, mobile-matching storage conventions) and renders media via participant-gated 15-minute signed URLs (`POST /api/chat/attachments`). Conversation previews are type-aware ("📷 Photo", "🎤 Voice note (12s)", "📄 file"). **COMPLETE.**

**Feedback from a performance review** (`POST /api/workout-feedback`): finds the coach/client conversation (`conversations.coach_id` = auth uid, matching the chat page convention), creates it if missing, inserts the message (service role, after active-subscriber verification), updates the conversation preview → client receives it via the existing chat. **COMPLETE.**

---

## 15. Next Workout

```text
Completed assignment → Performance review → "Duplicate as Next Workout"
↓ dialog pre-filled: exercises copied, weight pre-suggested from ACTUAL best (coach-editable)
  name defaults "{template} — next", date picker (tomorrow pre-filled)
↓ POST /api/workout-assignments { source_assignment_id, scheduled_date, template: adjusted }
  → creates a NEW template (atomic RPC) + a NEW assignment to the same client
  → original template, original assignment, and logged performance are NEVER mutated
```
**COMPLETE** (verified live: originals byte-identical after adjustment).

---

## 16. Revenue / Stripe

```text
/dashboard/revenue (server)
  resolveCoachId → payment_intents (last 20, joined client) → transactions table
  gross from succeeded payment_intents
  if coaches.stripe_account_id set AND real key:
    Promise.all([payouts.list(10), balanceTransactions.list(100)]) with stripeAccount header
    gross = Σ bt.amount · commission = Σ(amount − net) = actual Stripe fees · net = Σ bt.net
  else: commission = 15% estimate over local gross, clearly badged "Local estimate"
```
- Current state: the `stripe_account_id` location mismatch was **fixed** (reads/writes now on `coaches`, where the live column is) — the path engages as soon as a coach completes Connect onboarding in Settings.
- Settings (`/dashboard/settings`): shows connection status from `coaches.stripe_account_id`; "Connect payouts" → `POST /api/stripe/connect` (creates Express account + Account Link, stores the id on `coaches`); webhook `/api/webhooks/stripe` handles payment/account/subscription events (mock mode while keys are placeholders).
- Gross vs net vs fees are now distinctly labeled and computed from real data. **COMPLETE** (live-path end-to-end still unverified against a real connected account — flagged).

---

## 17. Settings

Implemented scope: **Stripe Connect (Express) onboarding + status only** — status badge from `coaches.stripe_account_id`, connect action, "Open Stripe Dashboard" link, plus an accurate step list. No profile/preferences editing exists. **COMPLETE for what it covers; profile/preferences editing = MISSING** (not in any spec so far).

---

## 18. Error / Edge Cases

| Trigger | Expected | Current behavior | Status |
| --- | --- | --- | --- |
| Unauthenticated /dashboard access | redirect to login | 307 → /login (layout guard) | ✅ |
| Non-coach authenticated user | block | "Access denied" screen + signout | ✅ |
| Missing coach record | honest gate | workouts/programs show "Coach profile missing"; other pages degrade to empty | ✅ |
| Missing profile row | treat as coach (dev) | role undefined → allowed + console warning | ⚠️ RISK (dev tolerance) |
| No subscribers / no active | empty state | explicit cards; assign/enroll dialogs disable submit | ✅ |
| No templates / programs | empty state | spec-exact empty states with CTA | ✅ |
| No assignments / linked session / sets | honest state | "session data not available yet"; per-exercise "no sets logged" | ✅ |
| Failed DB query | visible note | error badges/toasts (revenue dbError, chat toast, plans badge) | ✅ |
| RLS denial on read | empty/403 | empty states (plans SELECT bug live — see §23 RISK) | ✅ degraded |
| Expired session | refresh → login | middleware refresh; refresh-fail → /login | ✅ |
| Invalid form / upload | clear toast | friendly validation messages (no raw errors), upload rejections 400 with reasons | ✅ |
| Duplicate template send | dedupe | id-deduped appends; no double bubbles | ✅ |
| Deleted template with history | protect | 409 "cannot be deleted" | ✅ |
| Deleted program with enrollments | protect | 409 | ✅ |
| Deleted client | subscription vanishes | lists/profile degrade; assignments remain historical | ✅ |
| Inactive subscription | excluded | active-only client pickers; assignment API rejects (400) | ✅ |
| Stripe not connected | local estimate | badge + local payment_intents data | ✅ |
| Chat conversation missing | created on demand | feedback route creates conversation | ✅ |
| Network/server error | toast | every mutation path catches and toasts; no false success states | ✅ |
| Expired signed media URL | refetch once | self-healing "Attachment unavailable" fallback | ✅ |
| Oversized/wrong-MIME upload | 400 + reason | server-side limits; tested | ✅ |
| Non-participant signed-URL request | 403 | verified directly | ✅ |

---

## 19. Authorization Model

```text
COACH:  auth.uid() → coaches.user_id → coaches.id → ALL coach-owned data
CLIENT: auth.uid() → profiles.id (→ subscriptions.client_id for coach relationships)
```

| Area | Coach authorization | Client authorization |
| --- | --- | --- |
| Subscriptions/clients | `subscriptions.coach_id = coaches.id` (RLS: coach_id+status index; service role after check) | own rows via `client_id = auth.uid()` |
| Workout templates | ownership through `coaches.user_id = auth.uid()` (`wt_coach_all`) | SELECT only via assignment (`wt_client_read`) |
| Template exercises | through parent template (`wte_coach_all`) | SELECT via assignment (`wte_client_read`) |
| Assignments | coach CRUD (`wa_coach_all`) | SELECT own; UPDATE **status column only** (table UPDATE revoked, column grant) |
| Weekly programs | coach CRUD through program ownership (`cp_coach_all`, `cpd_coach_all`) | SELECT own enrollments only (`cpe_client_read`), no writes |
| Performance data | service-role reads gated on coach-owned assignment/subscription | owner of own sessions/sets |
| Chat | conversation participant (coach_id = auth uid); signed URLs participant-verified | participant via client_id; storage policies scope path segment 1 to conversation participants |
| Revenue | coach-scoped payment_intents; Stripe calls use the coach's own connected account | none |

**No place treats the auth uid as `coaches.id`** in current code — the one historical confusion (the live `plans_coach_all` RLS policy, below) is database-side.

---

## 20. Database Relationships (actual live schema)

```text
auth.users ──(trigger)──▶ profiles (id = auth.uid, role, full_name generated)
    profiles 1:1 ──▶ coaches (user_id; stripe_account_id HERE, not on profiles)
    coaches 1:N ──▶ coach_onboarding · subscription_plans · workout_templates
                    coach_programs ──▶ coach_program_days ──▶ workout_templates
    coaches 1:N ──▶ subscriptions ──▶ profiles (client)  [client = coach's customer]
    coaches 1:N ──▶ workout_assignments ──▶ profiles (client)
                    workout_assignments.template_id ──▶ workout_templates
                    workout_assignments.enrollment_id ──▶ client_program_enrollments
                    client_program_enrollments ──▶ coach_programs (+ program)
    workout_templates 1:N ──▶ workout_template_exercises
    workout_assignments 1:N ──▶ workout_sessions (via assignment_id, written by MOBILE)
    workout_sessions 1:N ──▶ workout_sets
    profiles 1:N ──▶ daily_summary · nutrition_logs · body_measurements · user_goals
                     (the mobile app's client-logging tables)
    conversations (coach_id = coach AUTH UID, client_id = client) 1:N ──▶ messages
    payment_intents (coach_id = coaches.id, client_id = client)
    personal_records (VIEW over workout_sets ⊕ workout_sessions, best weight per exercise)
```

---

## 21. Route Map

```text
/                                   landing (static) — links to login/dashboard
├── login                           auth (client component)
├── signup                          coach registration + onboarding form
└── dashboard                       (layout: auth guard + role check + sidebar)
    ├── (overview)                  KPIs, range charts, client table, export CSV, AI placeholder
    ├── workouts                    template library (+loading) — CREATE/EDIT/DUPLICATE/ASSIGN/PROGRAM/DELETE
    ├── programs                    program library (+loading) — CREATE/EDIT/ENROLL/DELETE
    ├── chat                        realtime chat, text + media (+loading)
    ├── subscribers                 client list (+loading)
    ├── subscribers/[id]            client profile (+loading): assigned workouts, programs, progress,
    │   ├── workouts/[assignmentId]     performance review (+loading), feedback, next-workout
    │   └── programs/[enrollmentId] program progress grid (+loading), Update Remaining Weeks
    ├── plans                       subscription plans CRUD
    ├── revenue                     payment_intents + Stripe payouts/balance
    └── settings                    Stripe Connect onboarding/status
API:
├── /api/auth/signout               POST/GET signout
├── /api/coaches                    POST coach onboarding
├── /api/plans                      POST/PATCH/DELETE plan CRUD (service role)
├── /api/stripe/connect             POST Express account + Account Link (coaches.stripe_account_id)
├── /api/webhooks/stripe            POST webhook (mock while placeholders)
├── /api/workout-templates          POST create (atomic RPC) · [id] PATCH/DELETE · [id]/duplicate POST
├── /api/workout-assignments        POST assign / next-workout (dual mode)
├── /api/workout-feedback           POST chat feedback
├── /api/chat/upload                POST media upload (multipart, validated)
├── /api/chat/attachments           POST signed URLs (participant-gated)
├── /api/client-active-program      GET client's active app program
├── /api/coach-programs             POST/PATCH/DELETE coach programs (atomic RPC)
├── /api/program-enrollments        POST enroll (bulk-generates assignments)
├── /api/program-enrollments/[id]/regenerate  POST Update Remaining Weeks
├── /api/coach/clients/search*      GET live subscriber search (uncommitted WIP)
└── /api/export/subscribers*        GET subscribers CSV export (uncommitted WIP)
```
Middleware: session refresh on all non-static routes.

---

## 22. API Map

Every API route follows the same contract: authenticate (`getUser`) → resolve coach (`resolveCoachId`) → validate input → verify ownership/relationship → service-role write or read → JSON response with friendly errors. RLS is never disabled; the service role is used only after authorization logic. Detailed per-route behavior: §21 above and `docs/PROJECT_SUMMARY.md`.

---

## 23. COMPLETE / INCOMPLETE / MISSING / BLOCKED / RISK

**COMPLETE** — authentication (login/signup/session/logout); coach onboarding (single-step); dashboard entry + navigation; subscribers list/profile; workout templates (CRUD + duplicate); workout assignment; weekly programs (library/builder/enroll/generate/regenerate); performance review; progress/PRs; chat incl. media; feedback; next-workout adjustment; settings/Stripe Connect; revenue local path; edge-case handling; route/API hygiene; tsc/build/tests.

**INCOMPLETE** — Overview (uncommitted WIP: AI assistant card is a decorative placeholder; recharts dependency removal inconsistent with committed chart files); subscribers list pagination/search (live search exists in WIP, list still unbounded — audit F6); no `error.tsx` route boundaries (only loading skeletons); password reset flow absent.

**MISSING** — nothing invented was expected: no separate onboarding wizard (by design, single-step signup covers it); no profile/preferences editor (never specified); no CI/CD claims here.

**BLOCKED** — mobile `assignment_id` write (external, documented handoff); Vercel deploy verification (one-time `vercel login`).

**RISK** — live `plans_coach_all` RLS policy broken (coaches can't SELECT own plans; fix written, unapplied — awaiting approval); layout `role === undefined` dev tolerance lets profile-less users through (documented dev bypass); overview WIP currently breaks the build (recharts imports vs removed dependency) until committed/resolved; exposed credentials in pushed history (rotation pending owner action).

---

## 24. Final Master Workflow

```text
                    ┌────────────────────────┐
                    │  Coach visits /login   │
                    └───────────┬────────────┘
                                ↓
                    ┌────────────────────────┐
                    │ Supabase Auth signin   │
                    └───────────┬────────────┘
                          ┌─────┴──────┐
                     wrong creds   coach?
                          ↓            ├─ no ──▶ signOut + "Access denied"
                     error toast       ↓
                    (stay /login)  profiles.role='coach'
                                        ↓
                          POST /api/coaches (signup path: onboarding rows)
                                        ↓
                    ┌────────────────────────────────────────────────┐
                    │                DASHBOARD                       │
                    │  (layout guard · sidebar · theme · realtime)   │
                    └───┬──────┬──────┬──────┬──────┬──────┬─────────┘
                        ↓      ↓      ↓      ↓      ↓      ↓
                    Overview  Chat  Subscribers Workouts Programs Revenue/Settings
                        ↓      ↓      ↓           ↓        ↓        ↓
              KPIs·charts·  text+  list(50)  Template  Program   Connect ·
              client table  media  ──▶ Client  library   enroll ▶  payouts·
              export·search ▶client  profile  ──▶ Assign ▶ assignments  balance
                        ↓     ↓      ↓           ↓        ↓        ↓
                   feedback ▶ Performance review ◀── mobile writes
                        ↓      (target vs actual · volume · PRs · notes)
                        ↓             ↓
                        └──▶ "Duplicate as Next Workout"
                                        ↓
                              adjusted assignment → client → mobile → session
                                        ↓
                                (loop repeats)
```

## 25. Recommended Next Steps

1. Land or discard the overview WIP (it currently breaks the build), then run audit item #6.
2. Approve + apply `rls_role_updates.sql` (plans SELECT fix) and `personal_records_index.sql`.
3. Owner: rotate the exposed Supabase/Stripe keys; revoke the `.env.qa` token.
4. `vercel login` → production deploy → read-only verification (per the deployment plan).
5. Hand `docs/mobile-assignment-linking.md` to the mobile engineer.
6. Add subscribers pagination + a password-reset flow (the two clearest user-facing gaps).
