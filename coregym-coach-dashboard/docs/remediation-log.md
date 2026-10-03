# CoreGym Remediation Log

Running record of every numbered remediation item: finding, change (file/line), verification, status.
Statuses: Done / Partially done / Blocked / Needs live DB access / Needs manual action.
No secret values appear in this log.

## Phase 0 — Immediate Production-Live Critical Fixes

### 1. LV1 — Anon read of `profiles` + `coaches`
- Found: live anon-key `select=*` returned full rows from both tables (verified 2026-09-27).
- Changed: NEW `supabase/rls_profiles_coaches_lockdown.sql` — enables RLS on both tables;
  `profiles`: own-row SELECT/UPDATE/INSERT + `profiles_coach_read_subscribed` (active-subscription join
  via `coaches.user_id = auth.uid()`); `coaches`: keeps `coaches_public_read_active` + `coaches_update_own`
  (marketplace need; residual `stripe_account_id` visibility documented in-file).
- Verified: `tsc`/`eslint` clean (migration is SQL-only; no app code touched). Live effect NOT verifiable
  from here — re-running the anon probe must show 0 rows for both tables after apply.
- Status: **Needs live DB access — STOP AND ASK before applying** (changes production RLS; mobile
  marketplace/chat reads must be smoke-tested after apply).
- Open question: mobile app may read coaches' `profiles` rows pre-subscription (name/avatar). An optional,
  commented-out `profiles_coach_marketplace_read` policy is in the file — enable only after confirming
  mobile reads, else those screens break.

### 2. LV2 — Webhook fail-open
- Found: missing/placeholder secrets → `{received:true,mock:true}` HTTP 200.
- Changed: `src/app/api/webhooks/stripe/route.ts:9-15` — now `console.error` + HTTP 503
  `{error:"Webhook not configured"}`. Verified: `tsc`/`eslint` clean; live re-probe (POST without
  signature) must return 503, not mock-200, until real secrets are set.
- Status: **Done (code). Needs manual action: set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in
  Vercel Production** (agent cannot do this).

## Phase 1 — Pre-Deploy Blockers

### 3. S1/N1/S5/S6/S7 — Ownership pre-reads
- S1 `src/app/api/client-nutrition/change/route.ts`: added UUID validation + two-step pre-read
  (`nutrition_assignment_foods` → `nutrition_assignments.client_id = user.id`), 404 on mismatch. Done.
- S5 `src/app/api/nutrition-enrollments/route.ts`: added `nutrition_programs.coach_id = ctx.coachId`
  pre-read, 404 on mismatch. Done.
- S6 `src/app/api/nutrition-enrollments/[id]/regenerate/route.ts`: added enrollment pre-read
  (404/403/active-only), mirroring the workout regenerate route. Done.
- S7 `src/app/api/coach-programs/route.ts` PATCH + `src/app/api/nutrition-programs/route.ts` PATCH:
  added program-ownership pre-reads, 404 on mismatch. Done.
- Verified: `tsc`/`eslint` clean. Live verification needs authenticated test calls (needs manual action).
- Status: **Done (code).**

### 4. S4 — Unscoped `program_id` in workout-assignments
- Found: lookup `training_programs.eq("id",pid)` has no coach scope. Live schema check (2026-09-27):
  `training_programs` has NO `coach_id` column — it is the mobile app's global catalog.
- Changed: documented the correct boundary in-code (`src/app/api/workout-assignments/route.ts:100-107`):
  tenant isolation lives on the assignment row (coach-owned template + subscribed client + `coach_id`),
  not on the catalog link; kept the existence check against dangling ids. No column invented.
- Status: **Done (documented, no code-behavior change needed).**

### 5. LV4 — `apply_coach_meal_edit` missing live
- Found: repo route `nutrition-assignments/[id]/foods` calls it; authenticated OpenAPI inventory (19 RPCs)
  lacks it. But `supabase/nutrition_coach_edits_migration.sql` EXISTS in repo (marked NOT APPLIED YET),
  signature matches the caller exactly, has REVOKE hardening + service_role-aware auth check, and all
  referenced columns exist live (verified column inventory).
- Changed: none needed — chose option (a), migration already written and compatible.
- Status: **Needs live DB access — STOP AND ASK to apply `nutrition_coach_edits_migration.sql`.**

### 6. S2 — Coach role self-grant
- Found: `POST /api/coaches` self-promotes via service_role; `is_coach()` absent live so
  `rls_role_updates.sql` must be treated as unapplied.
- Changed: `src/app/api/coaches/route.ts` — strict input caps (name 80, bio 1000, price 0–100000 finite,
  years 0–60, specialization trimmed ≤8) + eligibility gate: callers whose `profiles.role != 'coach'`
  with ANY active client subscription get 403 (must contact support to convert).
- Verified: `tsc`/`eslint` clean.
- Status: **Done (code). Needs live DB access — STOP AND ASK to apply `rls_role_updates.sql`** (trigger +
  `is_coach()` + coach-read policies) as defense-in-depth.
- Open question: if product must allow "subscribed client becomes coach", the 403 gate needs a conversion
  flow instead — confirm before relaxing.

### 7. S3 — Webhook idempotency
- Changed: NEW `supabase/stripe_webhook_events_migration.sql` (service-role-only table, RLS enabled with
  no client policies) + route checks `event.id` before processing (returns `{duplicate:true}`) and records
  it after success; failures degrade to warn-and-continue (verification still fails closed).
- Verified: `tsc`/`eslint` clean.
- Status: **Done (code). Needs live DB access — STOP AND ASK to apply the migration** (additive, low-risk).

## Phase 2 � Deployment Reliability

### 8. S9/LV5 � Security headers
- Changed: `next.config.ts` � CSP (self + Next inline + Supabase https/wss + Stripe.js + Google Fonts), HSTS preload, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(self) (voice notes), geolocation=()`.
- Verified: `tsc`/`eslint`/production build all pass. Live re-probe pending deploy.
- Status: **Done (code). Needs manual action: re-probe prod headers after deploy.**

### 9. S8 � Error boundaries
- Changed: NEW `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `src/app/(dashboard)/error.tsx` � generic messages + digest reference only.
- Verified: build passes.
- Status: **Done.**

### 10. S11 � Middleware redirect
- Changed: `src/lib/supabase/middleware.ts` � unauthenticated non-public, non-API requests 307 to `/login`; API keeps own 401 JSON. Layout guard retained.
- Verified: `tsc`/`eslint`/build pass.
- Status: **Done (code).**

### 11. S12 � Dev-mode role bypass
- Changed: `src/app/(dashboard)/layout.tsx` � undefined-role bypass only when `NODE_ENV !== "production"`; production fail-closes to deny panel.
- Verified: `tsc`/`eslint`/build pass.
- Status: **Done.**

### 12. D1/D2 � next.config + env check
- Changed: headers (item 8); NEW `src/lib/env-check.ts` called from root layout � loud server error in production on missing/placeholder `NEXT_PUBLIC_*` vars, warn-only elsewhere (CI unaffected).
- Regions/durations deliberately left at Vercel defaults � needs a plan/audience decision.
- Status: **Done (code). Needs manual action: decide Vercel region + function duration limits.**

### 13. LV3 � Stale production
- No code change. Promotion gated on Phases 0-2 + live migration applies.
- Status: **Needs manual action � STOP AND ASK before promoting any deploy to production.**

## Phase 3 � Database Performance

### 14. DB3 � Composite indexes
- Changed: NEW `supabase/dashboard_performance_indexes_migration.sql` � `subscriptions(coach_id,status)`, `conversations(coach_id,last_message_at DESC)`, `workout_assignments(coach_id,client_id)`, `nutrition_assignments(enrollment_id,scheduled_date)` (all IF NOT EXISTS).
- Status: **Needs live DB access � STOP AND ASK to apply** (brief write locks; run off-peak + EXPLAIN after).

### 15. DB4 � Trigram food search
- Changed: NEW `supabase/foods_trgm_migration.sql` � `pg_trgm` extension + GIN trigram indexes on `foods.name`, `foods.name_ar`.
- Status: **Needs live DB access � STOP AND ASK to apply** (extension may need owner privileges).

### 16. P1 � Revenue fallback bound
- Changed: `src/app/(dashboard)/dashboard/revenue/page.tsx` fallback sum query now `.limit(2000)` with comment.
- Verified: tsc/eslint/build pass.
- Status: **Done.**

### 17. P3 � Library pagination
- Changed: NEW `src/lib/pagination.ts` (LIB_PAGE_SIZE=20, parse/clamp/range helpers) + NEW server `src/components/dashboard/Pager.tsx`; NEW `loadCoachProgramsPage` / `loadNutritionProgramsPage` (range + exact count, shared row mappers); programs/workouts/nutrition/plans pages now take `?page=`, clamp, slice, and render `<Pager/>`. Unpaged loaders kept for compatibility. Revenue-tx stays last-20 by design (recent-transactions feed, documented here).
- Note: template-name dropdown on programs page stays a cheap `id,name` list (needed whole for the builder).
- Verified: tsc/eslint/build pass.
- Status: **Done.**

### 18. DB2 � schema.sql deprecated
- Changed: `supabase/schema.sql` header now a DO-NOT-APPLY deprecation banner citing the live-verified ownership model (file kept for history).
- Status: **Done.**

### 19. DB5 � REVOKE blocks on workout/program RPCs
- Changed: appended least-privilege `REVOKE FROM public,anon` + `GRANT TO authenticated,service_role` blocks to `supabase/workout_templates_migration.sql` (2 RPCs) and `supabase/coach_programs_migration.sql` (3 RPCs), matching the nutrition pattern.
- Status: **Needs live DB access � STOP AND ASK to apply** (re-running the migration files; idempotent statements).

## Phase 4 � API/Server Performance

### 20. P2 � Revenue parallelization
- Changed: `src/app/(dashboard)/dashboard/revenue/page.tsx` � tx query + `coaches.stripe_account_id` lookup now in one `Promise.all`; profile mapping unchanged (dependent, correctly sequential).
- Verified: tsc/eslint/build pass. Regression trap intact: canonical `coaches.stripe_account_id` usage untouched.
- Status: **Done.**

### 21. W2 � Workout parser caps
- Changed: `src/lib/workout-input.ts` � name/exercise-name 200 chars, notes 2000, muscles 20, exercises 100, sets 1-100, reps 1-10000, weight 0-5000kg, rest 0-86400s (mirrors nutrition parser style).
- Verified: tsc/eslint/build pass. Unit tests added in Phase 7 (item 31).
- Status: **Done.**

### 22. ST3 � Connect rate limit
- Changed: NEW `src/lib/rate-limit.ts` (per-user 60s cooldown map, bounded) + enforced in `POST /api/stripe/connect` (429 on repeat).
- Note: per-instance only (serverless); global limit needs KV � flagged as future work, not required now.
- Verified: tsc/eslint/build pass.
- Status: **Done.**

### 23. S10 � Generic API errors
- Changed: NEW `src/lib/api-error.ts` (`dbError` logs server-side, returns generic message); mapped 40+ raw `*.message` passthroughs across 23 route files; webhook signature errors now return literal "Invalid signature". Own validation/ownership literals kept.
- Verified: tsc/eslint/build pass; remaining `.message` uses are server-side only (throws, log checks, property access).
- Status: **Done.**

## Phase 5 � Frontend Performance

### 24. P4 � Batched attachment URLs
- Changed: `POST /api/chat/attachments` accepts `{messageIds: []}` (max 50, UUID-validated, per-message participant check, parallel mint, `{urls}` map) + single-path UUID validation; `ChatClient` prefetches visible media ids in one batch into `attachmentUrls` state; `MediaMessage` accepts `prefetchedSrc` (single fetch kept as fallback + expiry path).
- Verified: tsc/eslint/build pass.
- Status: **Done.**

### 25. P5 � Server components
- Changed: removed unnecessary `"use client"` from `src/components/ui/table.tsx` + `src/components/ui/label.tsx` (pure HTML). Interactive primitives (dialog/select/sheet/tabs/etc., Base-UI-backed avatar/separator) intentionally kept client.
- Verified: tsc/eslint/build pass.
- Status: **Done.**

### 26. P6 � Remote image config
- Found: all landing `next/image` sources are local (`/landing/...`, `/public`); no remote hosts anywhere in `src`. `remotePatterns` would be dead config.
- Changed: none (verified not-needed).
- Status: **Done (no change required).**

## Phase 6 � Chat/Program/Nutrition Fixes

### 27. CH1 � Read-state persistence
- Changed: `src/components/chat/ChatClient.tsx` open-conversation effect � read-state writes now awaited with one retry; on final failure the badge rolls back to its previous count + error toast (was fire-and-forget `void`, the stuck-badge shape).
- Verified: tsc/eslint/build pass. Live behavior needs an interactive session (manual QA).
- Status: **Done (code).**

### 28. CH2 � UPDATE subscriptions
- Changed: same channel now also subscribes `UPDATE` on `messages` (merges `is_read` into open thread, clears badge when all client messages read) and `UPDATE` on `conversations` (merges `coach_unread` into list badges). INSERT path untouched; cleanup unchanged.
- Verified: tsc/eslint/build pass.
- Status: **Done (code).**

### 29. N3 � Save from local state
- Changed: `NutritionClient` builder `handleSave` now upserts the card from the just-saved builder days (real names/macros/badges) instead of `{days:[]}`; `router.refresh()` still reconciles server ids afterwards.
- Verified: tsc/eslint/build pass.
- Status: **Done.**

## Phase 7 � Monitoring, CI, and Cleanup

### 30. S13 � QA files gitignore
- Changed: root `.gitignore` now ignores `.qa-*` + root `loadtest-*.json`.
- Verified: `git log --all -- .qa-cookie.txt .qa-e2e-creds.txt .qa-coach-id.txt` returns empty � **never committed**. `git check-ignore` confirms the new rules match. No rotation needed on git grounds. (Note: `docs/loadtest-*.json` were already tracked before this task � left untouched.)
- Status: **Done. No STOP AND ASK needed** (no evidence of exposure via git).

### 31. CI2 � Tests + audit
- Changed: `package.json` (`npm test` = node --test over 6 files, zero new deps); `.github/workflows/ci.yml` gains blocking Tests + Audit (`--audit-level=high`) steps; job renamed.
- New tests (26 added, 61 total passing): `tests/workout-input.test.ts` (W2 caps), `tests/chat-unread.test.ts` (badge math via NEW pure `src/lib/chat-unread.ts`, extracted verbatim from chat page), `tests/exercise-performance.test.ts` (review math via NEW `src/lib/performance-math.ts`, extracted verbatim from workouts.ts + re-exported), `tests/ownership.test.ts` (S5/S7 `isCoachOwned` in NEW `src/lib/ownership.ts`, retrofitted into 4 routes). Chat page + workouts.ts behavior unchanged (same logic, new location).
- Verified: `npm test` 61/61 pass; `tsc`/`eslint`/build/audit all pass.
- Status: **Done.**

### 32. LV6 � Preview/Dev env + log drain
- Not touched (no access). Manual action items for owner below.
- Status: **Needs manual action.**

## Needs my confirmation to apply live (STOP AND ASK list)
1. Apply `supabase/rls_profiles_coaches_lockdown.sql` to production (LV1) � changes live RLS; smoke-test mobile marketplace/chat after.
2. Apply `supabase/rls_role_updates.sql` to production (S2 trigger + is_coach + coach-read policies).
3. Apply `supabase/nutrition_coach_edits_migration.sql` to production (LV4 � unblocks foods-edit route).
4. Apply `supabase/stripe_webhook_events_migration.sql` to production (S3 idempotency table; additive).
5. Apply `supabase/dashboard_performance_indexes_migration.sql` off-peak (DB3).
6. Apply `supabase/foods_trgm_migration.sql` (DB4; extension may need owner).
7. Apply appended REVOKE/GRANT blocks by re-running `workout_templates_migration.sql` + `coach_programs_migration.sql` grant sections (DB5).
8. Set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in Vercel Production (LV2 code now fails closed until then).
9. Decide Vercel region + function duration limits (item 12).
10. Create Preview deployment for smoke tests, then promote to production (LV3) � only after 1-4.
11. Add Preview/Development env vars + log drain in Vercel (LV6).
12. Answer product question: may a subscribed client convert to coach (S2 gate), and does mobile read coaches profiles rows pre-subscription (LV1 optional policy).

## Verification summary (final, 2026-09-27)
- `npm test`: 61/61 pass. `tsc --noEmit`: clean. `eslint`: clean. `npm run build`: success. `npm audit`: 0 vulnerabilities.
- Regression traps intact: cached auth helpers, `coaches.stripe_account_id`, `coaches.user_id` RLS pattern, chat pagination, review math (moved verbatim).

---

# 2026-10-02 — Full audit remediation (second pass)

Baseline: docs/remediation-baseline-2026-10-02.md (tsc/lint/209 tests/build ALL GREEN @ bec37bc + design-agent uncommitted work preserved).
Plan: docs/remediation-execution-map-2026-10-02.md.

### S-06 — Existence oracle in program-enrollments (lead)
- Changed: `src/app/api/program-enrollments/route.ts` POST — program lookup now scoped `.eq("coach_id", ctx.coachId)`; foreign and missing both → 404 "Program not found" (removed 403 "belongs to another coach"). Mirrors the API-03 convention already used by workout routes.
- Changed: `src/app/api/nutrition-enrollments/[id]/regenerate/route.ts` POST — same normalization (scoped read; removed 403 branch; unused `isCoachOwned` import removed).
- Verified: tsc clean, eslint clean, 209/209 tests. Status: **Done (code).**

### S-08 — Rate-limit gaps (lead)
- Inventory: 24 mutating API routes had no rate limiting; helper = `src/lib/rate-limit.ts` (per-instance, documented limitation).
- Changed (limits on expensive/fan-out/abuse-sensitive only; plain coach CRUD deliberately left to auth+RLS to avoid breaking legitimate flows):
  - `ai/proposal-apply` POST — 10/min per coach (LLM + multi-write)
  - `chat/attachments` POST — 30/min per user (signed-URL minting)
  - `coaches` POST — cooldown 60s per user (onboarding writes under service role)
  - `program-enrollments` POST + `nutrition-enrollments` POST — 10/min per coach (assignment/meal-tree generation)
  - both `[id]/regenerate` POSTs — 10/min per coach (future-tree rewrite)
  - `workout-assignments` POST — 30/min per coach (template copy + per-date rows)
  - `workout-templates/[id]/duplicate` + `nutrition-programs/[id]/duplicate` — 10/min per coach
- Verified: tsc clean, eslint clean, 209/209 tests. Status: **Done (code).**

### U-04 — Dev CSP warning (lead)
- Changed: `next.config.ts` — `script-src` gains `'unsafe-eval'` ONLY when `NODE_ENV !== "production"` (Turbopack HMR requires it in dev). Production headers unchanged (no eval in prod CSP).
- Verified: tsc/eslint clean. Status: **Done (code). Live prod header re-probe still pending deploy (existing item 8).**

### F-15 — Password mismatch UX (disposition, no code)
- Verified in the design agent's current uncommitted code: `reset-password` shows an explicit error toast on mismatch (`toast.error(t("auth.reset.errors.mismatch"))`) and disables submit only while fields are empty; `signup` has no confirm-password field at all (no mismatch scenario). The "silently disables the button" symptom no longer exists.
- Status: **Resolved in design-agent code. No changes made (protected files).** Optional inline hint (type-time mismatch message) = design-agent polish, handed off.

### S-04/DB1 F1 — Coach credentials in public bucket (storage auditor; disposition by lead)
- Finding (HIGH): `CredentialsManager.tsx` uploads certificates AND achievements to the PUBLIC `coach-media` bucket; public URLs stored in `coach_content.file_url` (`is_public: true`); bucket is anon-enumerable. Intentional product behavior today (marketplace display contract).
- Dashboard does not render these anywhere except the owner's settings; the public-URL consumer is the MOBILE marketplace. Flipping to a private bucket + signed URLs would break mobile rendering — blocked by the cross-platform rule until Flutter usage is inspected.
- Prepared (NOT EXECUTED): `supabase/remediation-2026-10-02/db07_storage_policies.sql` (+rollback) — 33 least-privilege policies incl. optional anon-list revocation on public buckets (stops enumeration, keeps `/object/public/` GET) and the staged private-bucket fix runbook in docs/storage-audit-2026-10-02.md.
- Status: **Documented + SQL prepared. Blocked on: Flutter inspection + product decision (marketplace display of credentials).**

### LIVE SECURITY VERIFICATION (Management API + PostgREST probes, 2026-10-02)
Access: `.env.qa` = scoped Management API token (database query access, projects_read NOT granted). Target: mkrjvrnysuvtokqkyoll. Full catalog dump: docs/live-db-introspection-2026-10-02/. Probe report: docs/live-security-probe-2026-10-02.md.
- S-01/S-02 CONFIRMED LIVE (anon full-row reads; exact policies identified). S-03 CONFIRMED (cross-tenant conversation INSERT 201; probe row deleted). S-07 CONFIRMED fail-closed (coach own-plans = 0 rows). Cross-tenant reads by id = denied. RPC negative test = fails closed. `apply_coach_meal_edit` now LIVE (LV4 closed).
- db08 realtime migration NOT NEEDED: `messages` + `conversations` + day-partitions already in `supabase_realtime` (F-20 root cause lies client-side — E2E will pin).
- NEW finding: `participants_can_update_messages` allows content tampering by any participant → covered by prepared db09 trigger.
- F-01 SQL need confirmed: no unique index on conversations(coach_id, client_id); 0 duplicate pairs live.
- Prepared (NOT EXECUTED, awaiting authorization): supabase/remediation-2026-10-02/db09_conversation_security.sql + rollback (unique index, subscription-verified conversation INSERT policy, message update-scope trigger).

### U-06 — Builder empty rows (disposition)
- Verified: TemplateBuilder starts with 0 rows, `validate()` toasts "add an exercise", save feedback explicit. The "3 empty rows break first save" symptom does not exist in the current reconstructed builder. **FALSE POSITIVE (already resolved)** — no change.

### F-01..F-17 functional wave (agent, verified)
- F-01 secure server-side chat bootstrap (UUID check → ownership via subscriptions → find-or-create via user client under RLS; race re-select). F-03 error/404 split on all 4 dynamic pages + 3 lib loaders + NEW dashboard/error.tsx. F-11 server-side active-enrollment 409 on nutrition-enrollments. F-12 router.refresh after template create/duplicate/delete/assign. F-13 server-side search (?q=) composing with pagination + no-results state. F-14 enrollmentWeekOf() aligned to SQL convention + tests. F-16 subscription-vs-program date labels (EN+AR). F-17 copyTemplateName 200-char cap. Files: chat/page.tsx, subscribers pages ×5, workouts/nutrition/programs libs, ai/payload.ts, i18n/subscribers.ts, workout-input.ts, api routes, tests (231/231 pass, build green).

### F-20 Realtime — root cause RESOLVED via live experiments (2026-10-02)
- Experiment scripts: scripts/probes-2026-10-02/f20-realtime-experiment{,2}.mjs (one tagged message each; message+notification deleted, conversation counters reverted after each — full cleanup verified).
- ChatClient code verified CORRECT (single channel, INSERT/UPDATE bindings on messages + UPDATE on conversations, no filters needed, proper cleanup).
- Experiment 1 (channel with an extra binding on partition `messages_2026_10_02`): SUBSCRIBED but ZERO events → a postgres_changes binding on a PARTITION table poisons the whole channel registration server-side (dashboard never does this — documented hazard).
- Experiment 2 (clean channel, live JWT): **INSERT messages + UPDATE conversations events DELIVERED end-to-end** while subscribed; replication slots active/streaming, 0 lag.
- Verdict: original F-20 cause = missing publication membership at audit time; **fixed out-of-band since** (messages + conversations + messages_2026_10_* day-partitions now in supabase_realtime, plus supabase_realtime_messages_publication). db08 migration correctly NOT created (would be redundant). Remaining: real-browser double-tab confirmation in E2E.
- Push side-effect note: every test message fires one real push to the QA fixture client via send-chat-push edge function (accepted; minimal; documented).

### Read-receipt contract verified (for db09 tampering trigger backlog)
- Dashboard: ChatClient updates ONLY `is_read` on client messages of the open thread; UPDATE handler merges is_read + coach_unread.
- Mobile: `mark_conversation_read` RPC (SECURITY DEFINER, participant-checked) sets is_read + conversation counters.
- → db09's trigger (non-sender participants may change only is_read) is compatible with ALL legitimate flows, dashboard and mobile.

### Browser E2E regression (2026-10-02, real UI via playwright-core Edge profile)
- Auth: login/reload/logout/unauth-redirect/wrong-password all PASS (screenshots a1-*).
- Pages: overview, subscribers (+search, pagination next/prev/clear), profile, programs, workouts, nutrition, plans, settings, revenue, chat all render without error boundaries (b1-*, b2-*, b3-*).
- Template CRUD: create "[e2e 10-02] Push Day" → duplicate → rename → delete both; list counts consistent (c1-*). Enrollment create + removal verified (c2-*). F-11 409 surfaced in assign dialog for client with active enrollment (c3-*).
- Chat realtime TWO-TAB: message sent in tab 2 appeared in tab 1 WITHOUT reload (d1-tab1-realtime-arrived.png, d1b-*) — F-20 confirmed in real UI.
- F-01 bootstrap: /dashboard/chat?client=<never-messaged QA client> rendered the thread and CREATED conversation 7bef06ec… (deleted, 200; z2-f01.mjs). PASS.
- CSV export: 200 text/csv, 27 rows, proper quoting, zero unguarded formula-leading cells (z1-gaps.mjs). PASS.
- Throttled (Slow-3G-ish): skeleton visible immediately on workouts; settle 2.4s workouts / 4.6s profile (z1-gaps.mjs). U-02/U-03: no blank frame, no wrong-boundary flash observed.
- Settings: sections + theme toggle render; save feedback present (h.mjs, z1-*).
- Defects noted (minor, pre-existing/partially new): React duplicate-key console warnings from SubscribersPage list rendering (non-blocking); AI run button not driven via text-click in the harness (AI covered by unit/runtime tests instead of an E2E click-through).
- E2E agent hit an account quota limit mid-run; remaining checks completed by lead via scripts z1/z2/z3/z4 (same harness). Leftover tagged message + notification from the interrupted run were found and deleted; final sweep shows 0 artifacts.

### Adversarial security pass (API-route level, real session)
- S-06 CONFIRMED at route level: foreign program → 404 "Program not found" (no 403 oracle); foreign enrollment PATCH (valid status) → 404; foreign enrollment DELETE → 404; invalid duration → 400.
- AI route: foreign client fails closed (400 "A valid subscription id is required", no existence leak).
- Chat attachments: foreign message without attachment → 400 pre-participant-check (uniform-ish; requires unguessable UUID — accepted risk, noted).
- S-08 rate limits VERIFIED LIVE: chat/attachments 30 allowed → 429 at #31; program-enrollments 9 allowed → 429 at #10; coaches cooldown 400 → 429 on immediate retry; AFTER 62s cooldown the limiter released (business 400, not 429) — legitimate retries work. 429 bodies are generic (no internals leaked).

---

# CONTROLLED PRODUCTION-REMEDIATION PHASE — 2026-10-03 (authorized: 5 safe migrations)

Pre-apply revalidation: catalog matched baseline (60 tables/182 policies/39 fns/32 storage policies) except one benign out-of-band drift (get_streak_status + record_daily_activity search_path pinned externally — not in db04's ALTER list; their PUBLIC EXECUTE grants unchanged). All per-migration preconditions verified.

### 1. db05 — subscription_plans policy fix: **APPLIED + VERIFIED**
- Preflight: broken policy captured verbatim; coach owns 3 plans, reads 0 (fail-closed confirmed live).
- Post: coach reads own 3 plans; foreign plan by id → 0 rows; anon → 0 rows; client_read_subscribed_plans preserved verbatim; coach INSERT own plan 201 (probe row 76a7736c created then deleted — a first delete attempt silently missed; final sweep deleted it, coach plans = 3); coach INSERT foreign → 403.
- Rollback available: db05_*.rollback.sql (restores exact broken policy).

### 2. api01 — enrollment duration cap: **APPLIED + VERIFIED**
- Preflight: live body = pre-cap (verified), grants {postgres,authenticated,service_role}.
- Post: duration 53 → 400 P0001 "Duration must be between 1 and 52 weeks"; duration 0 → 400; valid duration 1 succeeds inside BEGIN…ROLLBACK (enrollment_id returned, count 7→7 unchanged); grants unchanged; mobile signature identical.
- (First verify run had a probe-script bug — 400 misread as unverified; dedicated probe confirmed the exact new-cap message. No rollback needed.)

### 3. db04 — SECURITY DEFINER hardening (v3): **APPLIED + VERIFIED**
- Applied: search_path pinned on is_my_active_client + handle_subscription_accepted, notify_new_message, sync_nutrition_to_summary, sync_workout_to_summary, update_coach_rating, update_conversation_on_message; REVOKE public,anon on record_daily_activity + get_streak_status; is_coach/prevent_role_escalation DO-blocks no-opped (absent).
- Post: all 7 proconfig pinned; both analytics RPCs = {postgres,authenticated,service_role} only; is_my_active_client own→true / foreign→false; get_streak_status authenticated 200 / anon 401; OpenAPI RPC inventory intact (≥19).

### 4. str02 — webhook idempotency/ordering: **APPLIED + VERIFIED (DB-level)**
- Compatibility: production still runs the OLD fail-open webhook (probe → mock-200); migration is additive and compatible with both code generations.
- Post: table exists (RLS on, zero policies, anon read → []); subscriptions.last_stripe_event_at added (34 rows, 0 watermarked); duplicate-claim → 409 23505 (first insert 201); probe rows cleaned (0 rows remain); auto-PK accounted in index count.
- Pending: end-to-end dedupe/ordering verification requires the NEW webhook code deploy + real STRIPE secrets (owner action).

### 5. db10 — missing indexes: **APPLIED + VERIFIED**
- 3 × CREATE INDEX CONCURRENTLY (one statement per call, all valid): idx_payment_intents_coach_status_created, idx_cpe_client, idx_workout_sets_user_weight.
- EXPLAIN: personal-records max(weight_kg) already uses INDEX ONLY SCAN on the new index; cpe/payments EXPLAINs seq-scan at today's tiny scale (planner-honest; benefit materializes with growth). No duplicates (142 = 138 baseline + 3 + str02 auto-PK).

### Post-remediation state
- Catalog: 61 tables (+stripe_webhook_events), 182 policies, 39 functions, 142 indexes, 2 publications, 32 storage policies, 32/39 functions pinned.
- Still open (by design, awaiting authorization/decisions): S-01/S-02 anon reads (db01 — Flutter check), S-03 RLS conversation creation (db09 — product), db06 (product), S-04 coach-media (Flutter).
- Data changes: only probe rows, all cleaned (0 artifacts). No commit/push/deploy.

---

# FINAL PRODUCTION DEPLOYMENT — 2026-10-03

- Pre-deploy: worktree forensics (66 entries classified A/B/C/D), deployment set staged explicitly (68 files), secret scan CLEAN (no keys/tokens; only a no-value documentation mention of .env.qa in the log), tsc PASS, eslint PASS, 231/231 tests, production build PASS, staged-diff review clean (0 console.logs/debug/eval/service-role-in-client).
- Design-agent work preserved: (auth) pages ×4, StatCard.tsx, i18n/domains/auth.ts, components/auth/**, NutritionClient.tsx, TopClientsTable.tsx + the 2 avatar hunks in overview.ts (surgically unstaged via filtered patch) — all remain uncommitted in the worktree.
- Deployment commits: 4c90c04 (audit remediation, 68 files) + 654f37b (TopBar import casing fix — layout.tsx imported 'Topbar' vs tracked 'TopBar.tsx', Linux-build blocker found by scripts/case-import-scan.mjs; disk file renamed to tracked casing).
- Pushed origin/main: b7311ca → 654f37b. Vercel GitHub integration NOT connected (push triggered no build; prior prod was a manual Sep-29 deploy) → deployed the EXACT pushed commit from a clean git worktree (.deploy-4c90c04 @ 654f37b, removed after).
- Deployment: coregym-coach-dashboard-m2qn0xxrk.vercel.app — **Ready** (previous prod: hfrmkn02h, Sep-29 manual deploy — rollback target).
- Prod smoke (orpin alias): unauth redirect ✓, login ✓, all 8 dashboard pages render ✓, subscriber ?q= search (F-13) ✓, client profile ✓, F-01 bootstrap creates thread ✓, two-tab realtime delivery ✓ (retest; first attempt failed due to harness thread-targeting, not the app), CSV export ✓, S-06 foreign→404 ✓, 429 enforced ✓, webhook fail-closed 503 (secrets not yet set in Vercel — owner action) ✓, no fatal page errors ✓.
- S-01/S-02 anon exposures still OPEN (db01 not applied — DB track, unchanged by this deployment).
- Data: probe rows created→cleaned→verified (final counts 15 conversations / 69 messages; 0 tagged leftovers; notification rows cleaned).
- No commit beyond the two deployment commits; design work intact; .env.qa never committed.

# DEPLOYMENT — 2026-10-03 (693bdd5, latest state incl. design work)
- Commit 693bdd5 "chore: ship latest dashboard updates" (13 files: auth pages ×4 + AuthShell/PasswordToggle/styles, StatCard, TopClientsTable, NutritionClient, auth i18n, overview avatar field, log) pushed 654f37b → 693bdd5; HEAD == origin/main.
- Validation on candidate: tsc clean, eslint 0/0, 231/231 tests, build ✓, case-sensitive import scan ALL RESOLVE, secret scan clean.
- Deployed via clean worktree (.deploy-693bdd5, removed after) → coregym-coach-dashboard-r0v52y2q4.vercel.app: Ready, target production, aliased to orpin.
- Prod smoke: login (fresh profile; new auth markup uses id=email/password ✓), 8 pages, ?q= search, profile, AI present, F-01 bootstrap ✓, CSV ✓, S-06 404 ✓, 429 ✓, webhook 503 fail-closed ✓, no fatal errors. Two-tab realtime verified via deterministic same-thread retest (tab1RealtimeArrived=true; bulk-run failures were harness thread-targeting, not the app).
- Artifacts cleaned: tagged pings, bootstrap conversations, notification rows — production data at baseline (15/69/0).
- Rollback target: m2qn0xxrk (654f37b deployment).
