# CoreGym Remediation Log

Running record of every numbered remediation item: finding, change (file/line), verification, status.
Statuses: Done / Partially done / Blocked / Needs live DB access / Needs manual action.
No secret values appear in this log.

## Phase 0 â€” Immediate Production-Live Critical Fixes

### 1. LV1 â€” Anon read of `profiles` + `coaches`
- Found: live anon-key `select=*` returned full rows from both tables (verified 2026-09-27).
- Changed: NEW `supabase/rls_profiles_coaches_lockdown.sql` â€” enables RLS on both tables;
  `profiles`: own-row SELECT/UPDATE/INSERT + `profiles_coach_read_subscribed` (active-subscription join
  via `coaches.user_id = auth.uid()`); `coaches`: keeps `coaches_public_read_active` + `coaches_update_own`
  (marketplace need; residual `stripe_account_id` visibility documented in-file).
- Verified: `tsc`/`eslint` clean (migration is SQL-only; no app code touched). Live effect NOT verifiable
  from here â€” re-running the anon probe must show 0 rows for both tables after apply.
- Status: **Needs live DB access â€” STOP AND ASK before applying** (changes production RLS; mobile
  marketplace/chat reads must be smoke-tested after apply).
- Open question: mobile app may read coaches' `profiles` rows pre-subscription (name/avatar). An optional,
  commented-out `profiles_coach_marketplace_read` policy is in the file â€” enable only after confirming
  mobile reads, else those screens break.

### 2. LV2 â€” Webhook fail-open
- Found: missing/placeholder secrets â†’ `{received:true,mock:true}` HTTP 200.
- Changed: `src/app/api/webhooks/stripe/route.ts:9-15` â€” now `console.error` + HTTP 503
  `{error:"Webhook not configured"}`. Verified: `tsc`/`eslint` clean; live re-probe (POST without
  signature) must return 503, not mock-200, until real secrets are set.
- Status: **Done (code). Needs manual action: set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in
  Vercel Production** (agent cannot do this).

## Phase 1 â€” Pre-Deploy Blockers

### 3. S1/N1/S5/S6/S7 â€” Ownership pre-reads
- S1 `src/app/api/client-nutrition/change/route.ts`: added UUID validation + two-step pre-read
  (`nutrition_assignment_foods` â†’ `nutrition_assignments.client_id = user.id`), 404 on mismatch. Done.
- S5 `src/app/api/nutrition-enrollments/route.ts`: added `nutrition_programs.coach_id = ctx.coachId`
  pre-read, 404 on mismatch. Done.
- S6 `src/app/api/nutrition-enrollments/[id]/regenerate/route.ts`: added enrollment pre-read
  (404/403/active-only), mirroring the workout regenerate route. Done.
- S7 `src/app/api/coach-programs/route.ts` PATCH + `src/app/api/nutrition-programs/route.ts` PATCH:
  added program-ownership pre-reads, 404 on mismatch. Done.
- Verified: `tsc`/`eslint` clean. Live verification needs authenticated test calls (needs manual action).
- Status: **Done (code).**

### 4. S4 â€” Unscoped `program_id` in workout-assignments
- Found: lookup `training_programs.eq("id",pid)` has no coach scope. Live schema check (2026-09-27):
  `training_programs` has NO `coach_id` column â€” it is the mobile app's global catalog.
- Changed: documented the correct boundary in-code (`src/app/api/workout-assignments/route.ts:100-107`):
  tenant isolation lives on the assignment row (coach-owned template + subscribed client + `coach_id`),
  not on the catalog link; kept the existence check against dangling ids. No column invented.
- Status: **Done (documented, no code-behavior change needed).**

### 5. LV4 â€” `apply_coach_meal_edit` missing live
- Found: repo route `nutrition-assignments/[id]/foods` calls it; authenticated OpenAPI inventory (19 RPCs)
  lacks it. But `supabase/nutrition_coach_edits_migration.sql` EXISTS in repo (marked NOT APPLIED YET),
  signature matches the caller exactly, has REVOKE hardening + service_role-aware auth check, and all
  referenced columns exist live (verified column inventory).
- Changed: none needed â€” chose option (a), migration already written and compatible.
- Status: **Needs live DB access â€” STOP AND ASK to apply `nutrition_coach_edits_migration.sql`.**

### 6. S2 â€” Coach role self-grant
- Found: `POST /api/coaches` self-promotes via service_role; `is_coach()` absent live so
  `rls_role_updates.sql` must be treated as unapplied.
- Changed: `src/app/api/coaches/route.ts` â€” strict input caps (name 80, bio 1000, price 0â€“100000 finite,
  years 0â€“60, specialization trimmed â‰¤8) + eligibility gate: callers whose `profiles.role != 'coach'`
  with ANY active client subscription get 403 (must contact support to convert).
- Verified: `tsc`/`eslint` clean.
- Status: **Done (code). Needs live DB access â€” STOP AND ASK to apply `rls_role_updates.sql`** (trigger +
  `is_coach()` + coach-read policies) as defense-in-depth.
- Open question: if product must allow "subscribed client becomes coach", the 403 gate needs a conversion
  flow instead â€” confirm before relaxing.

### 7. S3 â€” Webhook idempotency
- Changed: NEW `supabase/stripe_webhook_events_migration.sql` (service-role-only table, RLS enabled with
  no client policies) + route checks `event.id` before processing (returns `{duplicate:true}`) and records
  it after success; failures degrade to warn-and-continue (verification still fails closed).
- Verified: `tsc`/`eslint` clean.
- Status: **Done (code). Needs live DB access â€” STOP AND ASK to apply the migration** (additive, low-risk).

## Phase 2 — Deployment Reliability

### 8. S9/LV5 — Security headers
- Changed: `next.config.ts` — CSP (self + Next inline + Supabase https/wss + Stripe.js + Google Fonts), HSTS preload, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(self) (voice notes), geolocation=()`.
- Verified: `tsc`/`eslint`/production build all pass. Live re-probe pending deploy.
- Status: **Done (code). Needs manual action: re-probe prod headers after deploy.**

### 9. S8 — Error boundaries
- Changed: NEW `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `src/app/(dashboard)/error.tsx` — generic messages + digest reference only.
- Verified: build passes.
- Status: **Done.**

### 10. S11 — Middleware redirect
- Changed: `src/lib/supabase/middleware.ts` — unauthenticated non-public, non-API requests 307 to `/login`; API keeps own 401 JSON. Layout guard retained.
- Verified: `tsc`/`eslint`/build pass.
- Status: **Done (code).**

### 11. S12 — Dev-mode role bypass
- Changed: `src/app/(dashboard)/layout.tsx` — undefined-role bypass only when `NODE_ENV !== "production"`; production fail-closes to deny panel.
- Verified: `tsc`/`eslint`/build pass.
- Status: **Done.**

### 12. D1/D2 — next.config + env check
- Changed: headers (item 8); NEW `src/lib/env-check.ts` called from root layout — loud server error in production on missing/placeholder `NEXT_PUBLIC_*` vars, warn-only elsewhere (CI unaffected).
- Regions/durations deliberately left at Vercel defaults — needs a plan/audience decision.
- Status: **Done (code). Needs manual action: decide Vercel region + function duration limits.**

### 13. LV3 — Stale production
- No code change. Promotion gated on Phases 0-2 + live migration applies.
- Status: **Needs manual action — STOP AND ASK before promoting any deploy to production.**

## Phase 3 — Database Performance

### 14. DB3 — Composite indexes
- Changed: NEW `supabase/dashboard_performance_indexes_migration.sql` — `subscriptions(coach_id,status)`, `conversations(coach_id,last_message_at DESC)`, `workout_assignments(coach_id,client_id)`, `nutrition_assignments(enrollment_id,scheduled_date)` (all IF NOT EXISTS).
- Status: **Needs live DB access — STOP AND ASK to apply** (brief write locks; run off-peak + EXPLAIN after).

### 15. DB4 — Trigram food search
- Changed: NEW `supabase/foods_trgm_migration.sql` — `pg_trgm` extension + GIN trigram indexes on `foods.name`, `foods.name_ar`.
- Status: **Needs live DB access — STOP AND ASK to apply** (extension may need owner privileges).

### 16. P1 — Revenue fallback bound
- Changed: `src/app/(dashboard)/dashboard/revenue/page.tsx` fallback sum query now `.limit(2000)` with comment.
- Verified: tsc/eslint/build pass.
- Status: **Done.**

### 17. P3 — Library pagination
- Changed: NEW `src/lib/pagination.ts` (LIB_PAGE_SIZE=20, parse/clamp/range helpers) + NEW server `src/components/dashboard/Pager.tsx`; NEW `loadCoachProgramsPage` / `loadNutritionProgramsPage` (range + exact count, shared row mappers); programs/workouts/nutrition/plans pages now take `?page=`, clamp, slice, and render `<Pager/>`. Unpaged loaders kept for compatibility. Revenue-tx stays last-20 by design (recent-transactions feed, documented here).
- Note: template-name dropdown on programs page stays a cheap `id,name` list (needed whole for the builder).
- Verified: tsc/eslint/build pass.
- Status: **Done.**

### 18. DB2 — schema.sql deprecated
- Changed: `supabase/schema.sql` header now a DO-NOT-APPLY deprecation banner citing the live-verified ownership model (file kept for history).
- Status: **Done.**

### 19. DB5 — REVOKE blocks on workout/program RPCs
- Changed: appended least-privilege `REVOKE FROM public,anon` + `GRANT TO authenticated,service_role` blocks to `supabase/workout_templates_migration.sql` (2 RPCs) and `supabase/coach_programs_migration.sql` (3 RPCs), matching the nutrition pattern.
- Status: **Needs live DB access — STOP AND ASK to apply** (re-running the migration files; idempotent statements).

## Phase 4 — API/Server Performance

### 20. P2 — Revenue parallelization
- Changed: `src/app/(dashboard)/dashboard/revenue/page.tsx` — tx query + `coaches.stripe_account_id` lookup now in one `Promise.all`; profile mapping unchanged (dependent, correctly sequential).
- Verified: tsc/eslint/build pass. Regression trap intact: canonical `coaches.stripe_account_id` usage untouched.
- Status: **Done.**

### 21. W2 — Workout parser caps
- Changed: `src/lib/workout-input.ts` — name/exercise-name 200 chars, notes 2000, muscles 20, exercises 100, sets 1-100, reps 1-10000, weight 0-5000kg, rest 0-86400s (mirrors nutrition parser style).
- Verified: tsc/eslint/build pass. Unit tests added in Phase 7 (item 31).
- Status: **Done.**

### 22. ST3 — Connect rate limit
- Changed: NEW `src/lib/rate-limit.ts` (per-user 60s cooldown map, bounded) + enforced in `POST /api/stripe/connect` (429 on repeat).
- Note: per-instance only (serverless); global limit needs KV — flagged as future work, not required now.
- Verified: tsc/eslint/build pass.
- Status: **Done.**

### 23. S10 — Generic API errors
- Changed: NEW `src/lib/api-error.ts` (`dbError` logs server-side, returns generic message); mapped 40+ raw `*.message` passthroughs across 23 route files; webhook signature errors now return literal "Invalid signature". Own validation/ownership literals kept.
- Verified: tsc/eslint/build pass; remaining `.message` uses are server-side only (throws, log checks, property access).
- Status: **Done.**

## Phase 5 — Frontend Performance

### 24. P4 — Batched attachment URLs
- Changed: `POST /api/chat/attachments` accepts `{messageIds: []}` (max 50, UUID-validated, per-message participant check, parallel mint, `{urls}` map) + single-path UUID validation; `ChatClient` prefetches visible media ids in one batch into `attachmentUrls` state; `MediaMessage` accepts `prefetchedSrc` (single fetch kept as fallback + expiry path).
- Verified: tsc/eslint/build pass.
- Status: **Done.**

### 25. P5 — Server components
- Changed: removed unnecessary `"use client"` from `src/components/ui/table.tsx` + `src/components/ui/label.tsx` (pure HTML). Interactive primitives (dialog/select/sheet/tabs/etc., Base-UI-backed avatar/separator) intentionally kept client.
- Verified: tsc/eslint/build pass.
- Status: **Done.**

### 26. P6 — Remote image config
- Found: all landing `next/image` sources are local (`/landing/...`, `/public`); no remote hosts anywhere in `src`. `remotePatterns` would be dead config.
- Changed: none (verified not-needed).
- Status: **Done (no change required).**

## Phase 6 — Chat/Program/Nutrition Fixes

### 27. CH1 — Read-state persistence
- Changed: `src/components/chat/ChatClient.tsx` open-conversation effect — read-state writes now awaited with one retry; on final failure the badge rolls back to its previous count + error toast (was fire-and-forget `void`, the stuck-badge shape).
- Verified: tsc/eslint/build pass. Live behavior needs an interactive session (manual QA).
- Status: **Done (code).**

### 28. CH2 — UPDATE subscriptions
- Changed: same channel now also subscribes `UPDATE` on `messages` (merges `is_read` into open thread, clears badge when all client messages read) and `UPDATE` on `conversations` (merges `coach_unread` into list badges). INSERT path untouched; cleanup unchanged.
- Verified: tsc/eslint/build pass.
- Status: **Done (code).**

### 29. N3 — Save from local state
- Changed: `NutritionClient` builder `handleSave` now upserts the card from the just-saved builder days (real names/macros/badges) instead of `{days:[]}`; `router.refresh()` still reconciles server ids afterwards.
- Verified: tsc/eslint/build pass.
- Status: **Done.**

## Phase 7 — Monitoring, CI, and Cleanup

### 30. S13 — QA files gitignore
- Changed: root `.gitignore` now ignores `.qa-*` + root `loadtest-*.json`.
- Verified: `git log --all -- .qa-cookie.txt .qa-e2e-creds.txt .qa-coach-id.txt` returns empty — **never committed**. `git check-ignore` confirms the new rules match. No rotation needed on git grounds. (Note: `docs/loadtest-*.json` were already tracked before this task — left untouched.)
- Status: **Done. No STOP AND ASK needed** (no evidence of exposure via git).

### 31. CI2 — Tests + audit
- Changed: `package.json` (`npm test` = node --test over 6 files, zero new deps); `.github/workflows/ci.yml` gains blocking Tests + Audit (`--audit-level=high`) steps; job renamed.
- New tests (26 added, 61 total passing): `tests/workout-input.test.ts` (W2 caps), `tests/chat-unread.test.ts` (badge math via NEW pure `src/lib/chat-unread.ts`, extracted verbatim from chat page), `tests/exercise-performance.test.ts` (review math via NEW `src/lib/performance-math.ts`, extracted verbatim from workouts.ts + re-exported), `tests/ownership.test.ts` (S5/S7 `isCoachOwned` in NEW `src/lib/ownership.ts`, retrofitted into 4 routes). Chat page + workouts.ts behavior unchanged (same logic, new location).
- Verified: `npm test` 61/61 pass; `tsc`/`eslint`/build/audit all pass.
- Status: **Done.**

### 32. LV6 — Preview/Dev env + log drain
- Not touched (no access). Manual action items for owner below.
- Status: **Needs manual action.**

## Needs my confirmation to apply live (STOP AND ASK list)
1. Apply `supabase/rls_profiles_coaches_lockdown.sql` to production (LV1) — changes live RLS; smoke-test mobile marketplace/chat after.
2. Apply `supabase/rls_role_updates.sql` to production (S2 trigger + is_coach + coach-read policies).
3. Apply `supabase/nutrition_coach_edits_migration.sql` to production (LV4 — unblocks foods-edit route).
4. Apply `supabase/stripe_webhook_events_migration.sql` to production (S3 idempotency table; additive).
5. Apply `supabase/dashboard_performance_indexes_migration.sql` off-peak (DB3).
6. Apply `supabase/foods_trgm_migration.sql` (DB4; extension may need owner).
7. Apply appended REVOKE/GRANT blocks by re-running `workout_templates_migration.sql` + `coach_programs_migration.sql` grant sections (DB5).
8. Set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in Vercel Production (LV2 code now fails closed until then).
9. Decide Vercel region + function duration limits (item 12).
10. Create Preview deployment for smoke tests, then promote to production (LV3) — only after 1-4.
11. Add Preview/Development env vars + log drain in Vercel (LV6).
12. Answer product question: may a subscribed client convert to coach (S2 gate), and does mobile read coaches profiles rows pre-subscription (LV1 optional policy).

## Verification summary (final, 2026-09-27)
- `npm test`: 61/61 pass. `tsc --noEmit`: clean. `eslint`: clean. `npm run build`: success. `npm audit`: 0 vulnerabilities.
- Regression traps intact: cached auth helpers, `coaches.stripe_account_id`, `coaches.user_id` RLS pattern, chat pagination, review math (moved verbatim).
