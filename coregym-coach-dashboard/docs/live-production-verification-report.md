# CoreGym Live Production Verification Report

> VERIFICATION ONLY. Nothing was modified: no code, migrations, policies, functions, triggers,
> storage, env vars, Vercel or Stripe settings. All probes were read-only (SELECT/catalog/GET/HEAD/POST-no-op).
> No secret values are printed anywhere in this report — presence/absence only.

## 1. Executive Summary

- Verification date (UTC): 2026-09-27. Methods: Supabase PostgREST (anon + service_role keys from local
  `.env.local`, used read-only), Storage bucket API, Vercel CLI (authenticated), production HTTPS probes.
- **Status: `NOT VERIFIED — critical/high issues confirmed`.**
- Confirmed CRITICAL in production: (LV1) **unauthenticated internet can read full `profiles` rows
  (email, full_name, age, gender, weight, role) and full `coaches` rows (stripe_account_id, user_id)**;
  (LV2) **Stripe webhook returns fake-success `{received:true,mock:true}` HTTP 200 live** (no Stripe vars in prod).
- Confirmed HIGH: **production deployment is 8 days behind `main`** (Sep 19 deploy; nutrition system, foods API,
  privacy/terms missing live — all 404). Deploying current `main` as-is would publish routes whose RPC
  (`apply_coach_meal_edit`) does not exist live and a nutrition-mutation route whose ownership is unverified.
- Inconclusive (access-limited): RLS policy text, function bodies/grants, triggers, indexes, migration history —
  Supabase Management API token rejected (HTTP 401), no direct DB access, no Vercel logs found.
- Verified by design: dual identity model (chat uses auth-uid, everything else `coaches.id`),
  `stripe_account_id` on `coaches` only, storage object-RLS enforcement behavior on private buckets.

## 2. Verification Scope

Checked: Vercel project/deployments/env presence/regions/logs; production HTTPS routes, redirects, headers,
webhook live behavior; Supabase table/column inventory (31 tables), identity-key matching, anon-read exposure per
table, storage bucket inventory + anon list behavior, live RPC inventory (19), Stripe key mode/env presence.
Not accessible: `pg_catalog`/`pg_policies`/`pg_proc` bodies, trigger inventory, migration history, index inventory,
EXPLAIN, Stripe dashboard/API, Vercel runtime logs, production traffic metrics.

## 3. Production Environment

### Vercel

- Project: `coregym-coach-dashboard` (org `mohammedsaead643-3869s-projects`, id `prj_MWuguvnWTcUBI0xSR6Ax4aBfidT8`).
- Latest production deployment: `dpl_82eniU5bBkgWAGXsV77TJFFciztR`, `● Ready`, created **Sep 19 2026** (~8 days old),
  build duration 23 s, functions region `iad1`, middleware global. Aliases incl.
  `coregym-coach-dashboard-orpin.vercel.app`.
- Env vars (Production only — **no Preview/Development rows exist**): `NEXT_PUBLIC_SUPABASE_URL` PRESENT,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` PRESENT, `SUPABASE_SERVICE_ROLE_KEY` PRESENT (Hidden),
  `NEXT_PUBLIC_APP_URL` PRESENT. **`STRIPE_SECRET_KEY`: MISSING. `STRIPE_WEBHOOK_SECRET`: MISSING.**
- Supabase Management API (`.qa-sql.mjs` token): HTTP 401 Unauthorized — catalog-level verification impossible.
- `vercel logs <prod deployment>`: "No logs found" — runtime log evidence unavailable.

### Supabase

- Project ref from repo tooling: `mkrjvrnysuvtokqkyoll` (public URL component only, not a secret).
- PostgREST reachable; unauthenticated OpenAPI disabled (401 without key); service_role-authenticated OpenAPI OK.
- Local Stripe key mode: `sk_test…` but contains `placeholder` (dev placeholder, unusable); production has no key at all.

### Stripe

- No Stripe env in Vercel production; no Stripe API/dashboard access from this environment.
- Webhook endpoint registration, signing-secret value, event history: UNKNOWN.

## 4. Database Schema Verification

Column inventories read live via service_role `select=*&limit=1` (column names only, values never exported).
All repository-expected tables exist: `profiles`, `coaches` (+`policy`, +`stripe_account_id`, +`user_id`),
`coach_onboarding`, `training_programs` (**no `coach_id` column — global mobile catalog**),
`workout_templates`, `workout_template_exercises`, `workout_assignments` (+`enrollment_id`, +`week_number`),
`workout_sessions`, `workout_sets`, all 8 nutrition tables, `coach_programs`, `coach_program_days`,
`client_program_enrollments`, `payment_intents` (**table exists but EMPTY — 0 rows**),
`subscriptions`, `subscription_plans`, `conversations` (+`coach_unread`/`client_unread`/`last_message`),
`messages`, `coach_content` (+`type`, +`is_public`), `foods`, `exercises`, `personal_records` (view),
`daily_summary`, `user_goals`. PKs/FKs/constraints/indexes: UNKNOWN (no catalog access).

## 5. Migration Verification

| Migration | Repository Status | Live Production Status | Evidence |
| --------- | ----------------- | ---------------------- | -------- |
| nutrition programs (8 tables) | in repo | APPLIED (tables + 4 RPCs present) | Table/column probe + RPC list 2026-09-27 |
| nutrition coach edits (`apply_coach_meal_edit`) | in repo | **NOT APPLIED — function absent** | Authenticated OpenAPI lists 19 RPCs, no `apply_coach_meal_edit` |
| coach programs / workout templates (+ atomic RPCs) | in repo | APPLIED (tables + 5 RPCs present) | Same evidence |
| `coach_content_type_migration.sql` | marked NOT APPLIED YET | UNKNOWN (column `type` exists, constraint text unverifiable) | `coach_content` columns include `type` |
| `rls_role_updates.sql` (`is_coach`, role trigger, coach-read policies) | in repo | **PARTIALLY SUSPECT — `is_coach()` absent live** | `POST /rpc/is_coach` → 404 PGRST202 |
| storage policies | none in repo | UNKNOWN definitions; enforcement behavior observed (§10) | Bucket list + anon-list probes |
| migration history table | n/a | UNKNOWN — Management API 401 | `node .qa-sql.mjs "select 1"` → HTTP 401 |

## 6. RLS Verification

Policy text: UNKNOWN (no `pg_policies` access). **Effective behavior VERIFIED via anon-key probes**:

| Table | Anon `select=id&limit=5` | Anon `select=*` scope | Status |
| ----- | ------------------------ | --------------------- | ------ |
| `profiles` | 200, 5 rows | **all 13 columns incl. `email`, `full_name`, `age`, `gender`, `weight_kg`, `role`** | VERIFIED EXPOSED (CRITICAL, LV1) |
| `coaches` | 200, 5 rows | **all 11 columns incl. `stripe_account_id`, `user_id`, `policy`** | VERIFIED EXPOSED (CRITICAL, LV1) |
| `foods`, `exercises`(catalog) | rows returned | full catalog columns | Expected public catalog — OK |
| `subscriptions`, `payment_intents`, `conversations`, `messages`, `nutrition_programs`, `workout_templates`, `coach_content`, `coach_reviews`, `subscription_plans` | 200, **0 rows** | n/a (deny-by-default or owner-policy filtering) | Restrictive for anon — OK, definitions UNKNOWN |

No `coach_id = auth.uid()` mis-pattern can be confirmed or denied textually; behavior shows tenant tables
return zero rows to anon, while `profiles`/`coaches` do not. Whether the exposure is "RLS disabled" vs
"public SELECT policy" is UNKNOWN — the effect is identical.

## 7. RPC / SECURITY DEFINER Verification

Live inventory (authenticated OpenAPI, 2026-09-27, 19 RPCs): `apply_nutrition_food_change`,
`create_nutrition_enrollment_atomic`, `create_program_enrollment_atomic`, `create_workout_template_atomic`,
`update_workout_template_atomic`, `upsert_coach_program_atomic`, `upsert_nutrition_program_atomic`,
`regenerate_remaining_enrollment_assignments`, `regenerate_remaining_nutrition_assignments`, plus mobile-app
RPCs (`get_leaderboard`, `get_streak_status`, `mark_conversation_read`, `unread_count`, …).
**Absent live: `apply_coach_meal_edit`, `is_coach`.**
Per-function security mode, owner, EXECUTE grants, `auth.uid()` usage: UNKNOWN for all 19.
Anon empty-body call to `apply_nutrition_food_change` returns shape-mismatch 404 (PGRST202) — inconclusive on grants.

## 8. Critical Nutrition Authorization Verification

**Classification: UNKNOWN (route not live; direct-RPC path unverifiable).**
- Repository finding S1 is **NOT CONFIRMED as a live route**: `POST /api/client-nutrition/change` does not exist
  in production (deploy predates it). Live probing of the mutation was correctly refused (no state-changing calls).
- The underlying RPC `apply_nutrition_food_change` EXISTS live; its body, grants, and whether service-role
  callers carry ownership are UNKNOWN (Management API 401). Anon shape probe is inconclusive on grants.
- Consequence: deploying current `main` would publish the S1 route before its ownership question is answered —
  treat as a P0 deploy-gate, not a live exploit.

## 9. Coach Role Escalation Verification

**Classification: UNKNOWN — behavior not safely testable without controlled fixture.**
- `prevent_role_escalation()` existence, trigger binding, enabled status: UNKNOWN (no catalog access; no write tests
  performed, per safety rules).
- Negative signal: `is_coach()` (same migration file, `rls_role_updates.sql`) is ABSENT live, so that file's
  protections cannot be assumed applied. The `POST /api/coaches` self-grant code path is unchanged in repo.
- No role changes were attempted on any user.

## 10. Storage Policy Verification

Buckets VERIFIED live (service_role list, 2026-09-27): `avatars` (public), `coach-media` (public),
`coach-pdfs` (public), `food-images` (public), `food-scans` (private), `voice-food-logs` (private),
`chat-voice-notes` (private), `chat-images` (private), `chat-files` (private).
Behavior probes (anon key): object-list on private `chat-images` → HTTP 200 `[]` (RLS-filtered, not leaked);
object-list on public `avatars` → object entries returned.
Conclusion: object-level RLS enforcement EXISTS live (refines the repo audit's "no policies in migrations" —
production policies were created out-of-band). Exact policy definitions per operation: UNKNOWN.
No uploads, deletes, or policy reads/writes were performed.

## 11. Chat Identity Verification

**VERIFIED — split is real and consistent in live data.**
Sampled live rows (values compared in-script, IDs never exported): 11 coach rows, all with `id ≠ user_id`;
`conversations.coach_id` matched `coaches.user_id` 11/11 and `coaches.id` 0/11 (auth-uid style);
`subscriptions` 16/16, `workout_templates` 9/9, `nutrition_programs` 1/1, `coach_programs` 6/6,
`subscription_plans` 2/2 matched `coaches.id` (0 matched `user_id`). `payment_intents` has no rows to compare.
Repository chat code (`coachId = user.id`) matches live chat data. No normalization needed; document the rule.

## 12. Stripe Verification

- `stripe_account_id` location VERIFIED: column exists on `coaches`, absent on `profiles`; repo code consistent.
- Quantitative note: only 11 coach rows and 0 `payment_intents` rows exist — revenue features operate on empty data.
- Webhook: PRODUCTION RETURNS MOCK SUCCESS (see §13). Webhook registration/event health: UNKNOWN.
- Connect/payouts/subscription live behavior: UNKNOWN (no keys, no dashboard).

## 13. Vercel Verification

- Deployment/prod-branch wiring verified (§3); functions `iad1`; build 23 s.
- Live route probes 2026-09-27 (`coregym-coach-dashboard-orpin.vercel.app`):
  `/` → 200 (~2.4 s); `/login` → 200 (~0.6 s); `/dashboard` unauthenticated → **307 to `/login`** (guard works);
  `/does-not-exist-xyz` → 404 page; `/api/coach/status` → 401 JSON; `/api/coach/clients/search?q=ab` → 401.
- **Staleness PROVEN**: `/api/foods/search`, `/api/nutrition-programs`, `/privacy`, `/terms` → 404 in production,
  all added to repo Sep 25–26 (git: `3007c6e` Sep 25, README/legal Sep 26) while prod deploy is Sep 19
  (`829e507` era). `/api/coach-programs` → 405 (exists, method-gated) — consistent with Sep-19 code.
- Webhook live: `POST /api/webhooks/stripe` (no signature) → **`{"received":true,"mock":true,…}` HTTP 200
  (~1.1 s)** — S3 fail-open CONFIRMED live. Safe probe: mock path returns before any processing or writes.
- Headers (static `/login` and dynamic `/api/coach/status`): only Vercel-default
  `Strict-Transport-Security` present. **No `Content-Security-Policy`, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`** on either — S9 confirmed live.

## 14. Production Runtime / Logs

`UNKNOWN — production logs inaccessible` (`vercel logs` returns "No logs found" for the production deployment;
no log drains observed). No authentication/RLS/Stripe/webhook/chat/500/timeout patterns obtainable.
Nearest measured evidence is repo QA load-test data (NOT production): subscribers list ~1.6 s median,
profile/workout-history ~2.1 s, program grid median 2.3 s (worst 6.2 s first run), performance review ~1.6 s,
chat page ~0.6 s, revenue ~1.0 s, overview ~1.0 s; chat pagination fix verified (51 capped rows/16.7 KB vs
123-message/40 KB unbounded); 7-scenario concurrency waves all HTTP 200, zero errors
(`loadtest-results.json`, QA env — treat as directional, not prod telemetry).

## 15. Performance Evidence

No production APM/DB telemetry available — all production timing claims NOT MEASURED except the single-shot
route timings in §13 (homepage 2.4 s cold-ish, login 0.6 s, webhook mock 1.1 s; one sample each, not a benchmark).
Slow-query logs, p95s, Supabase latency, Stripe latency, timeout frequency: UNKNOWN.

## 16. Repository vs Production Differences

| Area | Repository Says | Production Says | Status |
| ---- | --------------- | --------------- | ------ |
| Coach identity | `coaches.id` (chat: auth-uid) | Same split in live data | VERIFIED |
| Stripe account col | `coaches.stripe_account_id` | Column on `coaches`, not `profiles` | VERIFIED |
| Nutrition mutation route | S1-risky route exists | Route 404 (deploy predates it); RPC exists, guards unknown | MISMATCH (stale prod) / UNKNOWN |
| Role protection trigger | `prevent_role_escalation()` in repo | Existence unknown; `is_coach` from same file absent | UNKNOWN, negative signal |
| Storage policies | none in repo | Buckets exist; object-RLS enforcement observed; defs unknown | PARTIAL MISMATCH (prod has out-of-band policies) |
| RLS | correct-pattern migrations | Tenant tables anon-deny; `profiles`+`coaches` anon-readable | MISMATCH (exposure verified) |
| `apply_coach_meal_edit` | route calls it | Function absent live | MISMATCH — would 500 if deployed |
| Stripe webhook | fail-open on missing secrets | Missing secrets + live mock-200 | VERIFIED (vulnerable state) |
| Vercel env | local `.env.local` complete | Prod lacks all Stripe vars; no Preview/Dev vars | VERIFIED gap |
| Security headers | none in repo | None live (except Vercel HSTS) | VERIFIED |
| Deploy freshness | main @ Sep 26 | Prod @ Sep 19 | MISMATCH (stale) |
| Migrations applied | 9 files in repo | Tables+most RPCs yes; 2 functions no; history unknown | PARTIALLY VERIFIED |

## 17. Confirmed Production Issues

- **LV1 — CRITICAL — Unauthenticated read of `profiles` + `coaches` (PII + `stripe_account_id` + `user_id` linkage).**
  Evidence: anon-key `select=*&limit=2` returned full rows (keys verified, values never exported) 2026-09-27.
  Confidence: certain (effect). Whether cause is disabled RLS vs public policy is unknown — fix either way. P0.
- **LV2 — CRITICAL — Stripe webhook fail-open live.** Evidence: Vercel env has no Stripe vars (§3) + live POST
  returns mock-200 (§13). Real payment/subscription events are silently dropped. P0.
- **LV3 — HIGH — Production 8 days behind `main`.** Evidence: Sep-19 deployment vs Sep 25–26 routes returning 404
  (§13) + git dates. Impact: nutrition/chat fixes untested in prod; next deploy ships S1-route + missing-RPC caller. P1.
- **LV4 — HIGH — `apply_coach_meal_edit` absent live while repo route depends on it.** Evidence: 19-RPC inventory
  without it (§7). Impact: instant 500s on the foods-edit path after next deploy. P1.
- **LV5 — HIGH — Security headers missing live** (only Vercel HSTS). Evidence: response headers §13. P1.
- **LV6 — MEDIUM — No Preview/Development env vars; no log retention found.** Evidence: `vercel env ls`
  (Production-only rows), `vercel logs` empty. Impact: preview deploys run unconfigured; incidents undiagnosable. P2.
- **LV7 — MEDIUM — `payment_intents` empty + no Stripe key in prod ⇒ revenue pipeline unverifiable end-to-end**
  (page renders zeros; webhook can never populate). Evidence: 0-row probe + §3. P2.

## 18. Unverified / Unknown Items

RLS policy text; function bodies/grants/owners (`apply_nutrition_food_change` ownership logic included);
`prevent_role_escalation` existence/state; migration-history table; index inventory; EXPLAIN results; trigram/FTS
presence; storage policy definitions; Stripe webhook registration/secret value/health, Connect/payout behavior;
Vercel durations/regions-per-function beyond `iad1`, cron, preview behavior; production traffic/error/latency
metrics; `coach_content` constraint text; `training_programs` ownership expectations (no `coach_id` column —
S4's program-link check has nothing to scope against there; ownership must be enforced at the link-creation layer).

## 19. Recommended Fix Order

Based ONLY on verified production facts; no fixes implemented:
1. P0: Restrict `profiles`/`coaches` anon reads (enable RLS + least-privilege SELECT policies), verify with the
   same anon probes (expect 0 rows / 401) — LV1.
2. P0: Set real `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` in Vercel Production (or disable the route) so the
   webhook verifies or fails closed; re-POST expecting 400-missing-signature, not mock-200 — LV2.
3. P1: Reconcile live DB before ANY deploy: create `apply_coach_meal_edit` (or remove its caller), confirm
   `is_coach`/role-trigger state, re-run RPC inventory expecting 20+/trigger present — LV4 + §9.
4. P1: Deploy `main` to a Preview with proper env, smoke-test nutrition/chat/revenue paths, then promote — LV3.
5. P1: Add security headers (`next.config.ts`) and confirm live via header probes — LV5.
6. P2: Add Preview/Dev env vars, attach log drain/Vercel logging, answer S1-grants + trigger questions with
   catalog access, then proceed to the repo-audit fix phases — LV6 + §§8–9.

## 20. Final Production Readiness Status

`NOT VERIFIED — critical/high issues confirmed`
