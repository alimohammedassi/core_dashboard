# CoreGym Production Audit Report

> **AUDIT ONLY — no code, migrations, policies, env vars, or config were modified.**
> Date (UTC): 2026-09-27. Repo root: `F:\core_Dashboard\core_dashboard`
> App dir: `coregym-coach-dashboard/`. Stack: Next.js 16.3.4 (Turbopack) + React 19.2.8 + TS 5 + Tailwind 4 + shadcn/base-ui.
> Secret values are never printed in this report — all redacted as `[REDACTED]`.

## 1. Executive Summary

The dashboard is a coach-only Next.js App Router app on Vercel backed by the shared Supabase (mobile app) Postgres backend.
Auth/caching foundations from prior fix phases are **verified correct** (`cache()`-scoped `createClient`/`getCurrentUser`/`resolveCoachId`,
`requireCoachContext`, `coaches.stripe_account_id` canonical usage). `tsc --noEmit` and `eslint` are clean and the production
build succeeds (~20 s, 39 routes). No dependency vulnerabilities (`npm audit`: 0).

Two CRITICAL findings block safe continued deployment: (C1) a mobile nutrition-mutation API with an unverifiable
ownership claim under service-role, and (C2) a self-serve coach-role grant whose only defense is a DB trigger of unknown
applied status. Beyond that: 11 HIGH (webhook mock-accept, unchecked cross-table links, missing error boundaries/headers,
unbounded fallback queries), 13 MEDIUM, 7 LOW. RLS migrations use the correct `coaches.user_id = auth.uid()` pattern, but
no storage-bucket policies exist anywhere in the repo and several claimed relationships need live-DB verification.

```text
Critical: 2
High:     11
Medium:   13
Low:      7

P0: 4
P1: 9
P2: 13
P3: 7
```

## 2. Deployment Findings

| ID | Severity | Area | Finding | Evidence | Impact | Recommended Fix |
| -- | -------- | ---- | ------- | -------- | ------ | --------------- |
| D1 | MEDIUM | Vercel config | `next.config.ts` is empty (7 lines, no headers, no regions, no durations, no image-remote config) | `coregym-coach-dashboard/next.config.ts:1-7` | No security headers, no runtime tuning, no remote-image allowlist | Define headers/regions/durations explicitly in a fix phase |
| D2 | MEDIUM | Env plumbing | Build inlines `NEXT_PUBLIC_*` at bundle time; CI builds with placeholder URL/key | `.github/workflows/ci.yml` (Build env `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`) | Preview/prod misconfig surfaces only at runtime | Add a runtime env-presence check on boot (fix phase) |
| D3 | LOW | Vercel linkage | `.vercel/project.json` present locally (projectId/orgId/projectName, no secrets) | `coregym-coach-dashboard/.vercel/project.json` | Informational only | None |
| D4 | MEDIUM | Runtime | Revenue page calls live Stripe (`payouts.list`, `balanceTransactions.list limit 100`) during SSR on every render | `src/app/(dashboard)/dashboard/revenue/page.tsx:81-84` | Slow renders, Stripe rate-limit/cold-start exposure | Move to cached route handler or ISR in fix phase |
| D5 | LOW | Deployment | All 39 routes are dynamic (`ƒ`); only `/login /signup /onboarding /privacy /terms /_not-found` static | Production build output 2026-09-27 | No stale-static risk; every dashboard hit is SSR | None — confirm Vercel region/duration in dashboard UI |

## 3. Security Findings

| ID | Severity | Area | Finding | Evidence | Impact | Recommended Fix |
| -- | -------- | ---- | ------- | ------ | ------ | --------------- |
| S1 | CRITICAL (P0) | API IDOR | `POST /api/client-nutrition/change` calls service-role RPC `apply_nutrition_food_change` with **no user/client id**; the "RPC verifies ownership itself" comment is unverifiable from the route because service-role carries no `auth.uid()` context | `src/app/api/client-nutrition/change/route.ts:30-36`; contrast ownership pre-check in sibling `client-nutrition/complete/route.ts:20-24` | Any authenticated user can mutate any `assignment_food_id` (quantity/substitution + history write) | Pass caller identity and add an explicit ownership pre-read before the RPC |
| S2 | CRITICAL (P0) | Privilege escalation | `POST /api/coaches` (onboarding) performs `profiles.update({role:"coach"})` for any authenticated caller — self-granted coach role unlocks every coach API | `src/app/api/coaches/route.ts` (`svc.from("profiles").update({role:"coach"…}).eq("id",user.id)`); only defense is `prevent_role_escalation()` trigger in `supabase/rls_role_updates.sql` | Any user can become a coach if the trigger is not applied live | Verify trigger is applied live; add server-side eligibility gate/rate limit |
| S3 | HIGH (P0) | Webhook | Missing/unplaceholder Stripe secrets make `POST /api/webhooks/stripe` return `{received:true,mock:true}` HTTP 200 **without verifying anything** | `src/app/api/webhooks/stripe/route.ts:9-15` | Silent drop of real payment/subscription events in any env with placeholder secrets; masks misconfiguration as success | Fail closed (non-2xx + alert) when secrets are absent in production |
| S4 | HIGH (P1) | API authZ | `workout-assignments` validates template ownership but links `program_id` via unscoped `training_programs.eq("id",pid)` — any program id can be linked | `src/app/api/workout-assignments/route.ts` (program lookup has no `.eq("coach_id",…)`) | Cross-coach program linkage | Scope the program lookup by `coach_id` |
| S5 | HIGH (P1) | API authZ | `POST /api/nutrition-enrollments` checks the subscriber row but never checks `nutrition_programs.coach_id` before the atomic-enrollment RPC | `src/app/api/nutrition-enrollments/route.ts` (no `from("nutrition_programs")` select) | Cross-coach program enrollment if RPC guard is weak | Add explicit program-ownership pre-read |
| S6 | HIGH (P1) | API authZ | `nutrition-enrollments/[id]/regenerate` calls the RPC with zero pre-checks and no UUID validation (contrast the program-enrollment twin that pre-checks) | `src/app/api/nutrition-enrollments/[id]/regenerate/route.ts:21` vs `src/app/api/program-enrollments/[id]/regenerate/route.ts` | IDOR fully delegated to RPC | Mirror the program-regenerate pre-check pattern |
| S7 | HIGH (P1) | API authZ | `PATCH /api/coach-programs` and `PATCH /api/nutrition-programs` pass `body.id` straight into upsert RPCs with no route-level ownership pre-read (defense-in-depth comment only) | `src/app/api/coach-programs/route.ts` (`p_program_id: body.id`), `src/app/api/nutrition-programs/route.ts` | Ownership depends entirely on RPC internals (workout/program RPCs have **no** `auth.uid()` guard — see §6) | Add scoped pre-reads before both RPC calls |
| S8 | HIGH (P1) | Errors | **No `error.tsx`, `global-error.tsx`, or `not-found.tsx` anywhere** under `src/app` | Filesystem search 2026-09-27: zero matches | Raw failures/blank screens; inconsistent status codes | Add boundaries per route segment in fix phase |
| S9 | HIGH (P1) | Headers | No CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy` anywhere | `next.config.ts:1-7` (empty); no header matches in `middleware.ts`/`layout.tsx` | Clickjacking/MIME-sniffing/XSS blast-radius exposure | Add headers in `next.config.ts` (fix phase) |
| S10 | MEDIUM (P2) | Error leakage | Most API routes return raw `error.message` from Supabase/RPC to the client | e.g. `client-nutrition/change/route.ts:37`, `nutrition-assignments/[id]/foods/route.ts`, webhook `route.ts:28` | Schema/RPC internals disclosed to callers | Map to generic messages; log details server-side |
| S11 | MEDIUM (P2) | Middleware | Middleware only refreshes the session; unauthenticated visitors are **not** redirected (comment says "layout handles redirect") | `src/lib/supabase/middleware.ts:40-44`; `src/app/(dashboard)/layout.tsx:27-29` does `redirect("/login")` | Defense-in-depth gap if any segment ever skips the layout guard | Redirect unauthenticated non-public requests in middleware |
| S12 | MEDIUM (P2) | Dev bypass | Dashboard layout treats missing `profiles.role` (`undefined`) as coach ("dev mode") | `src/app/(dashboard)/layout.tsx:36,76-79,121-123` | Stale/mis-migrated DB silently grants dashboard access | Gate dev bypass behind `NODE_ENV !== "production"` |
| S13 | MEDIUM (P2) | Secrets hygiene | `.env.local` (real keys, incl. `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `VERCEL_OIDC_TOKEN` names) exists on disk; QA session material (`.qa-cookie.txt` ~3 KB session, `.qa-e2e-creds.txt`) sits **untracked and unignored** at repo root | `git status --short` shows `?? .qa-*`; root `.gitignore` covers `.env*` but has **no `.qa*` rule**; only `.env.example` is tracked; no secret values printed here | Accidental `git add -A` commit of live session/creds | Add `.qa*` to root `.gitignore`; rotate any QA session material that may have been shared |
| S14 | MEDIUM (P2) | Webhook replay | No idempotency/replay guard on `payment_intent.succeeded` / subscription updates (blind `update().eq(...)`) | `src/app/api/webhooks/stripe/route.ts:36-69` | Duplicate deliveries cause redundant writes; out-of-order subscription events can regress status | Record processed `event.id` and skip duplicates |
| S15 | LOW (P3) | Attachments | `chat/attachments` requires auth + participant check but does not UUID-validate `messageId` | `src/app/api/chat/attachments/route.ts` | Minor injection/robustness surface | Add `UUID_RE` check (as `chat/upload` already does) |

## 4. Performance Findings

| ID | Severity | Area | Finding | Evidence | Impact | Recommended Fix |
| -- | -------- | ---- | ------- | ------ | ------ | --------------- |
| P1 | HIGH (P1) | Revenue SSR | Unbounded fallback query (`select amount … eq coach succeeded`, **no limit**) runs when gross is 0 | `revenue/page.tsx:120-127` | Full-table scan transferred on the slowest path | Add `.limit()`/aggregation or count query |
| P2 | MEDIUM (P2) | Revenue order | `coaches.stripe_account_id` lookup (independent) waits behind tx + profile mapping instead of joining a `Promise.all` | `revenue/page.tsx:34-74` | +1 sequential round trip per render | Parallelize with the tx query |
| P3 | MEDIUM (P2) | Pagination | Only `subscribers` (25/page + count) and chat/foods-search are paginated; programs/templates/plans/revenue-tx load full libraries with `limit()` caps only | `subscribers/page.tsx:12,34-35,61-65`; `programs/page.tsx:21-27`; `workouts/page.tsx:19-29`; `overview.ts` limits 5000/500 | Silent truncation at scale (>5000 payments/sessions dropped from overview) | Add `range()` pagination to libraries; surface truncation |
| P4 | MEDIUM (P2) | Chat media | Each media message triggers its own `POST /api/chat/attachments` (+1 retry on expiry) | `src/components/chat/MediaMessage.tsx:17-53`; TTL `CHAT_SIGNED_URL_TTL = 15 min` in `src/lib/chat-media.ts:38` | 50-image thread = ~50 POSTs | Batch signed-URL issuance per conversation open |
| P5 | LOW (P3) | Client islands | `use client` on shadcn primitives (`ui/table.tsx`, `ui/avatar.tsx`) and static dashboard cards forces hydration where Server Components would do | `src/components/ui/*`, `src/components/dashboard/*` | Extra JS/hydration cost | Demote static components to server in fix phase |
| P6 | LOW (P3) | Images | Chat + avatar use raw `<img>` (justified: expiring signed URLs); landing uses `next/image` with no `remotePatterns` config | `MediaMessage.tsx:67-68`, `SettingsSections.tsx:83-84`, `next.config.ts` | No optimization for landing images | Add `images.remotePatterns` if external hosts are used |

Measured (2026-09-27, local): `tsc --noEmit` clean; `eslint` clean; `npm audit --omit=dev`: **0 vulnerabilities**;
production build (Turbopack) succeeds in **~20 s** (compile 2.3 s + typecheck 4.3 s + 39 static generations).
Per-route JS bundle sizes are NOT MEASURED (Next 16 build output omits the legacy size table).

## 5. Database Findings

| ID | Severity | Area | Finding | Evidence | Impact | Recommended Fix |
| -- | -------- | ---- | ------- | ------ | ------ | --------------- |
| DB1 | HIGH (P1) | RLS gap | **Zero `storage.objects`/`storage.buckets` policies in any of the 9 migration files**, yet the app uses `avatars` (public-read), `chat-images/chat-voice-notes/chat-files`, and `coach_content` uploads | Full read of `supabase/*.sql`; app refs: `SettingsSections.tsx:42-46`, `chat/upload/route.ts`, `chat-media.ts:7-38`, `coach_content_type_migration.sql` | Cross-coach read/overwrite possible if live bucket policies are absent/permissive — NOT MEASURED live | Verify live bucket policies; add least-privilege `storage.objects` policies |
| DB2 | MEDIUM (P2) | Schema drift | `supabase/schema.sql` is a labeled **assumed/proposal** schema (no `coaches` table, `coach_id → profiles(id)`) that contradicts live types (`coaches{id,user_id}`, `coach_id → coaches.id`) | `schema.sql:1-6` header; `src/lib/supabase/types.ts:1-2,31-43` | Anyone applying `schema.sql` would create the `coach_id = auth.uid()` bug class | Mark `schema.sql` deprecated or delete in fix phase |
| DB3 | MEDIUM (P2) | Indexes | Only one performance index ships in-repo (`workout_sets(user_id, weight_kg desc)`); no evidence of indexes for `subscriptions(coach_id,status)`, `conversations(coach_id,last_message_at)`, `workout_assignments(coach_id,client_id)`, `nutrition_assignments(enrollment_id,scheduled_date)` | `supabase/personal_records_index.sql:12`; EXPLAIN NOT MEASURED (no live DB access from audit env) | Sequential scans as tables grow | Verify live indexes via `pg_indexes`; add composite indexes |
| DB4 | MEDIUM (P2) | Search cost | Food search uses leading-open `ILIKE %q%` on `name/name_ar` with only `q.replace(/[%_,]/g,"")` sanitization | `src/app/api/foods/search/route.ts`; `src/lib/nutrition.ts:125-134` (`range` p20) | Non-indexable scans on the foods catalog | Add trigram index or full-text search in fix phase |
| DB5 | LOW (P3) | Grants | Workout/program RPCs (`create_workout_template_atomic`, `upsert_coach_program_atomic`, …) are `SECURITY DEFINER` with **no `REVOKE … FROM public,anon`** block, unlike the nutrition RPCs | `supabase/workout_templates_migration.sql:203-281`, `supabase/coach_programs_migration.sql:192-406` vs `nutrition_programs_migration.sql` grant blocks | Direct RPC invocation surface wider than intended | Add matching `REVOKE/GRANT` blocks |

## 6. Authentication & Authorization Findings

| ID | Severity | Area | Finding | Evidence | Impact | Recommended Fix |
| -- | -------- | ---- | ------- | ------ | ------ | --------------- |
| A1 | MEDIUM (P1) | Dual identity | Chat tables use **auth-uid** ownership (`conversations.coach_id = user.id`) while everything else uses **coaches.id** — the split is consistent in code but undocumented in the schema and one wrong assumption breaks either side | `dashboard/chat/page.tsx:11-12` ("conversations.coach_id is the auth user id"); `chat/upload/route.ts` (`.or(coach_id.eq.user.id…)`); `workout-feedback/route.ts` (`eq(coach_id,ctx.userId)`); vs `subscriptions/workout_assignments/payments` all `eq(coach_id,coachId→coaches.id)` | A future "cleanup" unifying to one key silently breaks chat or leaks it | Document the dual-key rule in `types.ts`; add a regression test |
| A2 | LOW (P3) | Helper fallback | `resolveCoachId` falls back to `userId` when no coach row exists; `requireCoachContext` treats `coachId === user.id` as "no coach" — correct but fragile (a real `coaches.id` can never equal an auth uid only by UUID chance) | `src/lib/coach.ts:9-13`; `src/lib/workouts.ts:32-39` | Silent 403/empty states pre-onboarding | Return `null` instead of the fallback in a fix phase |
| A3 | — (verified) | Caching | `createClient()`, `getCurrentUser()`, `resolveCoachId` are all `cache()`-scoped; layout + page share one `getUser` round trip; `createServiceClient()` correctly uncached | `supabase/server.ts:8-9,34-43`; `lib/auth.ts:8`; `lib/coach.ts:9` | No cross-user leakage by design | Already correct — do not change |

RLS mapping verdict (from migration sources, not live): `coach_programs`, `nutrition_*` (8 tables), `workout_templates*`,
`subscriptions`-coach-reads and `is_coach()` (live version) all use the correct `coaches.user_id = auth.uid()` join.
The only `coach_id = auth.uid()` policies live in the **assumed** `schema.sql`, plus a documented fix in
`rls_role_updates.sql:158-164`. No application code was found comparing `coaches.id` to `auth.uid()`.

## 7. Stripe Findings

| ID | Severity | Area | Finding | Evidence | Impact | Recommended Fix |
| -- | -------- | ---- | ------- | ------ | ------ | --------------- |
| ST1 | — (verified) | Account mapping | `stripe_account_id` is read/written **only** on `coaches` — revenue page, settings page, and connect route all agree; no `profiles.stripe_account_id` reference exists | `revenue/page.tsx:73-75`; `settings/page.tsx:19-25`; `api/stripe/connect/route.ts`; `types.ts:40` | Correct — do not change | None |
| ST2 | — (verified) | Schema-cache error | The reported `payment_intents ↔ profiles` relationship error is **handled, not fixed**: the code avoids the join entirely (comment explains `client_id → auth.users` is not PostgREST-joinable) and maps names in memory | `revenue/page.tsx:30-33,52-63` | Works but costs an extra query per render | Add a real FK or view in fix phase if the join is desired |
| ST3 | MEDIUM (P2) | Connect abuse | `POST /api/stripe/connect` mints account links with no rate limit | `src/app/api/stripe/connect/route.ts:53` | Link-minting abuse | Add rate limiting |
| ST4 | LOW (P3) | Accounting | Non-Stripe commission is a hardcoded 15% estimate; Stripe path derives fees from `balanceTransactions` (correct) | `revenue/page.tsx:99-106,128-129` | Misleading "commission" label pre-connect | Label estimate explicitly (partially done via Badge) |

## 8. Chat Findings

| ID | Severity | Area | Finding | Evidence | Impact | Recommended Fix |
| -- | -------- | ---- | ------- | ------ | ------ | --------------- |
| CH1 | MEDIUM (P2) | Unread badge | Opening a chat **optimistically** zeroes the badge and fire-and-forgets `messages.is_read=true` + `conversations.coach_unread=0` with **no error handling or rollback**; a failed write leaves the green badge stuck until refresh | `src/components/chat/ChatClient.tsx:98-113`; badge `302`; list query `dashboard/chat/page.tsx:38-50` | The reported "badge remains after opening" symptom matches this path exactly | Await the write, retry on failure, reconcile on realtime events |
| CH2 | LOW (P3) | Realtime scope | Exactly one `messages INSERT` channel per coach (`coach:${coachId}:messages`), cleaned up on unmount; `UPDATE` (read-state from mobile) events are **not** subscribed | `ChatClient.tsx:157-184` | Read-state set from the phone never clears the dashboard badge live | Subscribe to `UPDATE` on read-state columns or refetch on focus |
| CH3 | — (verified) | Loading shape | List embeds only the latest message per conversation (`limit(1, referencedTable)`, `limit(50)`); thread pages `PAGE_SIZE=50` with `lt(created_at)` keyset | `dashboard/chat/page.tsx:22-34`; `ChatClient.tsx:85,136-149` | Prior "linear payload growth" fix verified present | Already correct |

## 9. Program / Workout Findings

| ID | Severity | Area | Finding | Evidence | Impact | Recommended Fix |
| -- | -------- | ---- | ------- | ------ | ------ | --------------- |
| W1 | — (verified) | Query shape | No N+1: nested single-query loads (`coach_programs→days→template`), batched `.in()` for sessions→sets, `Promise.all` at every independent fan-out | `src/lib/programs.ts:28-39,158-170,239-258`; `src/lib/workouts.ts:207-214,346-372` | Already correct | None |
| W2 | MEDIUM (P2) | Validation gaps | Template parser caps nothing: no max on name/notes length, exercise count, `target_sets`, or weight magnitude; nutrition parser caps (200/2000 chars, 20 meals, 50 foods) but not day-notes length or quantity magnitude | `src/lib/workout-input.ts:35-92`; `src/lib/nutrition-input.ts:32-117` | Oversized payloads → slow saves, huge renders | Add symmetric caps to both parsers |
| W3 | — (verified) | Review math | Warmup excluded from volume, duration falls back to `ended_at − started_at`, name matching normalized, empty-session state handled | `src/lib/workouts.ts:253-254,291-295,181-184` | Prior performance-review fixes verified present | None |

## 10. Nutrition Findings

| ID | Severity | Area | Finding | Evidence | Impact | Recommended Fix |
| -- | -------- | ---- | ------- | ------ | ------ | --------------- |
| N1 | HIGH (P1) | Ownership | See S1 (change route), S5–S7 — nutrition write paths delegate ownership to RPCs whose guards cannot see the caller under service-role | `client-nutrition/change/route.ts`; `nutrition_programs_migration.sql` guards (`auth.role()<>'service_role'` branches) | Same as S1/S5–S7 | Route-level pre-reads before every nutrition RPC |
| N2 | MEDIUM (P2) | Migration state | `coach_content_type_migration.sql` is header-marked **NOT APPLIED YET**; applied-state of all 9 migrations vs live is NOT MEASURED from this environment | `supabase/coach_content_type_migration.sql` header; no live DB access | Code may reference columns/policies that do not exist live | Reconcile migration-applied state against live before any fix |
| N3 | LOW (P3) | Save UX | Nutrition save synthesizes a `{days:[]}` stub then `router.refresh()` — day badges stale until revalidation | `src/components/nutrition/NutritionClient.tsx:507-514,389` | Cosmetic staleness | Render from the POST response |

## 11. CI/CD Findings

| ID | Severity | Area | Finding | Evidence | Impact | Recommended Fix |
| -- | -------- | ---- | ------- | ------ | ------ | --------------- |
| CI1 | — (verified) | CI gate | Node 22, `npm ci`, blocking typecheck + lint + placeholder-env build, per-ref concurrency — matches the previously reported behavior; verified present and green (`tsc` clean, `lint` clean, build succeeds) | `.github/workflows/ci.yml`; measurements 2026-09-27 | Correct — do not weaken | None |
| CI2 | MEDIUM (P2) | CI scope | No test step, no `npm audit` step, no preview/prod smoke step | `.github/workflows/ci.yml` (three steps only) | Regressions in unread math, volume math, ownership gates ship silently | Add unit tests for parsers/math + audit step in fix phase |

## 12. Confirmed Problems

Only items with in-repo evidence (file:line or command output):

1. S1 — nutrition change route IDOR surface (`client-nutrition/change/route.ts:30-36`).
2. S2 — coach-role self-grant (`api/coaches/route.ts` + trigger status unknown).
3. S3 — webhook mock-accept on placeholder secrets (`webhooks/stripe/route.ts:9-15`).
4. S4/S5/S6/S7 — unscoped `program_id` links and RPC-delegated ownership (4 routes cited).
5. S8 — zero error/not-found boundaries (filesystem search).
6. S9 — zero security headers (`next.config.ts:1-7`).
7. DB1 — zero storage RLS policies in all 9 migrations.
8. CH1 — fire-and-forget read-state write matching the reported stuck-badge symptom.
9. P1 — unbounded revenue fallback query (`revenue/page.tsx:120-127`).
10. W2 — template parser has no size caps (`workout-input.ts`).
11. S13 — QA session material untracked + unignored at repo root (`git status`).

## 13. Potential Risks

Requiring live-environment verification before action:

- Whether `prevent_role_escalation()` is applied live (decides S2 exploitability).
- Whether `apply_nutrition_food_change` enforces ownership for service-role callers (decides S1 exploitability; read the live function source).
- Whether live storage buckets have policies outside this repo (decides DB1 exploitability).
- Whether all 9 migrations are applied live, esp. `coach_content_type_migration.sql` (marked NOT APPLIED).
- Whether `conversations.coach_id` is auth-uid or `coaches.id` live (decides whether A1 is merely untidy or actively wrong).
- Vercel production env values, regions, durations, and log history (not accessible from this environment).
- Real traffic metrics (p95, cold starts, DB timings) — all NOT MEASURED.

## 14. Already Correct / Verified

Do not regress or "fix" these in the next phase:

- `cache()`-scoped `createClient`/`getCurrentUser`/`resolveCoachId` + `requireCoachContext` + `dashboard/loading.tsx` present.
- `coaches.stripe_account_id` canonical everywhere; no `profiles.stripe_account_id`.
- RLS migrations use `coaches.user_id = auth.uid()`; documented `subscription_plans` fix present.
- Performance-review math (warmup exclusion, duration fallback, normalized name matching, no-session state).
- Overview/programs/nutrition/workouts libraries: `Promise.all` + batched `.in()`, no N+1 found.
- Chat list bounding (`limit(1)` embedded message, 50-thread keyset pagination).
- `npm audit`: 0 vulnerabilities. `tsc` + `eslint` clean. Build green (~20 s, 39 routes).
- Only `.env.example` tracked; `.env.local` gitignored and never committed (history scan clean).

## 15. Unknown / Needs Manual Verification

- Vercel production/preview env values, regions, function durations, cron, log drains.
- Supabase live schema, applied-migration state, live RLS policies, storage bucket policies, index inventory (`pg_indexes`), RPC sources.
- Production traffic metrics, slow-query logs, Stripe live-mode event history.
- Whether the reported `payment_intents↔profiles` schema-cache error persists for any remaining join (code now avoids the join).
- Whether QA fixtures referenced in `docs/qa-fixture-cleanup-manifest.md` still exist in production.

## 16. Root Cause Map

```text
Authentication
 ├── cache()-scoped helpers verified correct (auth.ts, coach.ts, server.ts)
 ├── middleware refresh-only, no redirect (S11)
 └── dev-mode role bypass on undefined role (S12)

Authorization
 ├── service-role routes with RPC-delegated ownership (S1, S5, S6, S7)
 ├── unscoped program_id link (S4)
 ├── coach-role self-grant (S2)
 └── dual identity model chat(auth-uid) vs rest(coaches.id) (A1)

Database
 ├── no storage policies in repo (DB1)
 ├── assumed schema.sql contradicts live types (DB2)
 ├── single shipped index; EXPLAIN not measured (DB3)
 └── ILIKE food search without trigram/FTS (DB4)

Security posture
 ├── no error boundaries (S8) + raw error.message leakage (S10)
 ├── no security headers (S9) + no rate limiting anywhere
 └── webhook mock-accept + no replay guard (S3, S14)

Performance
 ├── revenue SSR: live Stripe + unbounded fallback (D4, P1, P2)
 ├── pagination only on subscribers/chat/search (P3)
 └── chat signed-URL fan-out per media message (P4)

Process
 ├── QA session material unignored at root (S13)
 └── CI has no tests/audit/smoke steps (CI2)
```

## 18. Fix Dependency Map

```text
Live-state verification (migrations applied? trigger present? bucket policies? indexes?)
   ↓
RLS + storage correction + coaches-route gate (S2, DB1)
   ↓
API authorization pre-reads (S1, S4–S7, N1)
   ↓
Webhook fail-closed + idempotency (S3, S14)
   ↓
Query optimization + pagination (P1–P3, DB3, DB4)
   ↓
Caching (only after authZ is correct — never cache per-coach data across users)
   ↓
Headers, boundaries, rate limits, CI tests (S8, S9, CI2)
```

## 17. Recommended Fix Order

```text
Phase 0 — Critical security / production blockers (P0: S1, S2, S3 + live verification of trigger/RPC/buckets)
Phase 1 — Authorization / RLS (S4–S7, N1, A1 documentation, DB1 storage policies, DB2 deprecate schema.sql)
Phase 2 — Deployment reliability (D1 headers/regions, D2 env check, S8 boundaries, S11 middleware redirect, S12 dev-gate)
Phase 3 — Database performance (DB3 indexes, DB4 search, P1 bound fallback, P3 pagination)
Phase 4 — API/server performance (P2 parallelization, W2 parser caps, ST3 rate limit, S10 error mapping)
Phase 5 — Frontend performance (P4 batch URLs, P5 server components, P6 image config)
Phase 6 — Chat/program/nutrition optimization (CH1 await+reconcile, CH2 UPDATE subscription, N3 save response)
Phase 7 — Monitoring and cleanup (S14 idempotency, CI2 tests+audit, S13 gitignore + rotation check)
```

## 19. Production Readiness Checklist

```text
[ ] Deployment stable
[ ] Authentication verified
[ ] Authorization verified
[ ] RLS verified
[ ] No cross-coach data access
[ ] No exposed secrets
[ ] API validation verified
[ ] Storage security verified
[ ] Stripe security verified
[ ] Database indexes verified
[ ] Critical queries verified
[ ] Major performance bottlenecks identified
[ ] Chat performance verified
[ ] Program performance verified
[ ] Nutrition performance verified
[ ] CI/CD verified
[ ] Production monitoring verified
[ ] Security headers reviewed
[ ] Dependency vulnerabilities reviewed
```

Notes: only "Dependency vulnerabilities reviewed" (`npm audit`: 0, 2026-09-27) and "CI/CD verified"
(CI gate inspected + green locally) have evidence; no box is marked complete — live verification is outstanding
for every other item. "No exposed secrets" is explicitly NOT checked: secret values were never inspected, and
S13 (unignored QA session material) remains open.

## 20. Evidence Rules

Every finding above cites exact paths and line numbers, migration filenames, or command output
(`tsc`, `eslint`, `npm audit`, `npm run build`, `git status`, filesystem searches). Items that could not be
proven against the live backend are labeled NOT MEASURED / needs-manual-verification in §§13/15 and were
severity-capped accordingly. No metrics were invented.
