# CoreGym Production Migration Review

> READ-ONLY audit. No migration was applied; no production write of any kind was executed
> (no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE/GRANT/REVOKE/INDEX/EXTENSION).
> No repo files were modified; the only change is the creation of this report.
> Evidence tags: `VERIFIED LIVE` (observed in production this session),
> `VERIFIED FROM REPOSITORY` (read in repo files this session),
> `INFERRED` (reasoned, not observed), `NOT VERIFIABLE WITHOUT WRITE` (needs a write or privileged catalog access).

Review date (UTC): 2026-09-27. Live access used: PostgREST anon + service_role (read-only SELECTs,
column-name inventory, exact counts, OpenAPI RPC list, storage bucket list). Supabase Management API
remains unreachable (HTTP 401, unchanged); `pg_catalog`/`pg_policies`/`pg_proc`/`pg_indexes`/`pg_extension`
are NOT reachable through PostgREST, so policy text, function bodies/grants/owners, triggers, indexes and
extensions are NOT VERIFIABLE WITHOUT WRITE unless stated otherwise.

## Executive Summary

Of 7 migrations: **2 are SAFE TO APPLY** (webhook events table, dashboard indexes),
**3 are SAFE WITH CONDITIONS** (profiles/coaches lockdown, role updates, foods trigram),
**1 NEEDS CHANGES** (workout/program RPC grants — the proposed `authenticated` EXECUTE preserves a
live authenticated-IDOR because those RPC bodies contain no `auth.uid()` check),
**1 is SAFE WITH CONDITIONS with a schema-verify rider** (coach meal-edit RPC — signature and columns
match, but CHECK constraints and column types need one privileged look first).

New material findings beyond the remediation log: (a) mobile sign-up upserts
`profiles.role` including `'coach'` (rollback fragment), which constrains the role trigger's blast radius
and leaves an INSERT-path bypass; (b) enabling RLS on `profiles`/`coaches` will degrade two dashboard
reads for lapsed-subscription clients unless accepted; (c) index-creation locks are negligible at current
table sizes (largest target: 267 rows).

## Migration-by-Migration Verdict

### Migration 1 — `supabase/rls_profiles_coaches_lockdown.sql`
- Purpose: close VERIFIED LIVE anon full-row reads on `profiles` (59 rows incl. email/PII) and `coaches`
  (11 rows incl. `stripe_account_id`) by enabling RLS and installing least-privilege policies.
- Production dependency: tables + columns all VERIFIED LIVE (`profiles.id/role`, `coaches.id/user_id/is_active`,
  `subscriptions.client_id/coach_id/status`).
- Security assessment: `auth.uid()` usage correct (own-row `id = auth.uid()`); coach access correctly joins
  `coaches.user_id = auth.uid()`; `TO authenticated` on all four `profiles` policies denies anon; no DELETE
  policy on either table (deletes fail closed; nothing in repo deletes these rows — service_role bypasses
  regardless). `coaches_public_read_active` (no `TO` = PUBLIC, intentional) keeps `stripe_account_id`
  world-readable — residual risk, correctly disclosed in-file.
- Correctness assessment: active-subscription filter matches dashboard semantics; paused/lapsed clients'
  profiles become invisible to the coach (see Issues).
- Performance assessment: EXISTS-subquery policies add per-row join cost; negligible at 59 profiles.
- Mobile compatibility: mobile sign-up `profiles.upsert({id: own uid, ...})`
  (VERIFIED FROM REPOSITORY, `rollback/.../login_sign_up.dart:508`) satisfies insert/update `WITH CHECK
  (id = auth.uid())`; home-page reads are own-row only (`fitness_home_pages.dart:848-870`).
  No pre-subscription coach-profile reads found in available fragments (only 3 dart files exist).
- Idempotency: IDEMPOTENT (ALTER ENABLE is a no-op when enabled; every CREATE is preceded by
  DROP IF EXISTS of the same name).
- Rollback: needs a second SQL file (DROP new policies / restore prior state); prior live policy text is
  NOT VERIFIABLE WITHOUT WRITE, so exact restore is unknown — snapshot `pg_policies` first (manual).
- Issues: (1) revenue name-mapping and chat client names degrade for clients whose subscription lapsed
  (MEDIUM, accepted-or-verify); (2) stripe_account_id stays public (LOW, disclosed).
- Required changes: none to the SQL; conditions below.
- Verdict: **SAFE WITH CONDITIONS** — smoke-test dashboard client lists/revenue/chat + mobile
  signup/home/marketplace after apply; snapshot live policies first.

### Migration 2 — `supabase/rls_role_updates.sql`
- Purpose: `prevent_role_escalation()` trigger + `is_coach()` + 6 subscribed-only coach-read policies +
  coaches marketplace policies + `plans_coach_all` key fix.
- Production dependency: all 8 tables and referenced columns VERIFIED LIVE; `is_coach()` currently absent
  VERIFIED LIVE (404 PGRST202); trigger state NOT VERIFIABLE WITHOUT WRITE.
- Security assessment: trigger is BEFORE UPDATE, fires on role changes both directions; SECURITY DEFINER
  on a body that only RAISEs is harmless; `is_coach()` mapping is correct and NULL-safe; the 6 coach-read
  policies use the correct join and expose only active-subscription rows (anon gets nothing since
  `auth.uid()` is NULL for anon); `plans_coach_all` uses the correct `coaches.id` join in both clauses.
- Correctness assessment: **INSERT-path bypass** — trigger covers UPDATE only, so a fresh row inserted
  with `role='coach'` is NOT blocked. Mobile sign-up upserts role directly (VERIFIED FROM REPOSITORY),
  so (a) new-user coach selection bypasses the trigger by design, and (b) conversely, if a profile row
  already exists, a mobile user selecting 'coach' gets a swallowed upsert failure and may stall as
  'client'. Both directions need the product decision below; the trigger alone does not settle S2.
- Performance assessment: negligible (row trigger on profiles updates; EXISTS policies on small tables).
- Mobile compatibility: as above — coach-signup path behavior changes for existing-row upserts (HIGH
  visibility, low data risk: failure is silent continue in current mobile code).
- Idempotency: IDEMPOTENT (CREATE OR REPLACE functions; DROP IF EXISTS trigger/policies before CREATE).
- Rollback: second SQL file (DROP TRIGGER/FUNCTION/policies); restoring pre-existing broader policies
  requires their unknown text — snapshot first.
- Issues: INSERT bypass limits S2 protection (HIGH, known limitation, dashboard route gate covers the
  dashboard vector); mobile coach-signup regression risk (HIGH, needs product confirmation).
- Required changes: none to SQL text; do NOT add an INSERT guard without the product decision.
- Verdict: **SAFE WITH CONDITIONS** — apply only together with the product answers; keep the dashboard
  `/api/coaches` eligibility gate as the primary control.

### Migration 3 — `supabase/nutrition_coach_edits_migration.sql`
- Purpose: create `apply_coach_meal_edit(uuid,text,uuid,numeric,uuid,text)` + least-privilege grants.
- Production dependency: function ABSENT live VERIFIED LIVE (not in 19-RPC inventory); every referenced
  column VERIFIED LIVE (`nutrition_assignments.*`, `nutrition_assignment_foods.template_food_id/
  current_food_id/change_type`, `nutrition_change_log.* incl. assignment_food_id,source`,
  `client_nutrition_enrollments.status`, `foods.*`); caller signature matches both call sites exactly
  VERIFIED FROM REPOSITORY (`nutrition-assignments/[id]/foods/route.ts:42-47,80-85`).
- Security assessment: SECURITY DEFINER with fixed `set search_path = public` (safe); direct-JWT callers
  must satisfy `coaches.id = assignment.coach_id AND user_id = auth.uid()` (correct tenant check);
  service_role path relies on the route's `.eq("coach_id", ctx.coachId)` pre-read VERIFIED FROM
  REPOSITORY; attacker-supplied assignment/food/enrollment ids resolve through the victim assignment's
  own coach row, so cross-tenant edits fail closed. Route also UUID-validates inputs.
- Correctness assessment: edit-window rules (active enrollment, non-completed, non-past; skipped
  editable) match the route comments; quantity>0 enforced; zero-serving fallback avoids div-by-zero.
  CHECK values (`change_type` 'addition'/'removal', `source` 'coach_dashboard') and numeric column types
  are NOT VERIFIABLE WITHOUT WRITE — a mismatch fails loudly (fail-safe), never corrupts.
- Performance assessment: single-row indexed lookups + two inserts; negligible.
- Mobile compatibility: none (dashboard-only RPC; mobile RPC set untouched).
- Idempotency: IDEMPOTENT (CREATE OR REPLACE; REVOKE of ungranted privilege warns but succeeds; GRANT
  repeatable).
- Rollback: `DROP FUNCTION ...` in a second file; in-flight edits are ordinary rows (no cleanup needed).
- Issues: CHECK/type confirmation outstanding (MEDIUM, fail-safe direction).
- Required changes: none to SQL; one privileged catalog look before apply (see Manual Verification).
- Verdict: **SAFE WITH CONDITIONS**.

### Migration 4 — `supabase/stripe_webhook_events_migration.sql`
- Purpose: `stripe_webhook_events(event_id text PK, event_type text NOT NULL, received_at timestamptz
  default now())` + RLS enabled with no client policies, backing webhook dedupe.
- Production dependency: table ABSENT live VERIFIED LIVE (404); no dependencies.
- Security assessment: no payload storage (no secret persistence); RLS-with-no-policies denies anon and
  authenticated via PostgREST while service_role (webhook client) bypasses — correct. PK is the
  authoritative race guard.
- Correctness assessment: route checks-then-acts (TOCTOU possible) but handlers are idempotent
  assignments of the same values, and the post-processing insert is swallowed on conflict — concurrent
  duplicates may both process, harmlessly. Crash-before-insert retries (at-least-once preserved).
- Performance assessment: one PK lookup + one insert per event; negligible.
- Mobile compatibility: none. Idempotency: IDEMPOTENT. Rollback: DROP TABLE (data is disposable dedupe
  markers; loss only re-allows replays briefly).
- Issues: none. Required changes: none.
- Verdict: **SAFE TO APPLY**.

### Migration 5 — `supabase/dashboard_performance_indexes_migration.sql`
- Purpose: 4 composite btree indexes matching dashboard predicates VERIFIED FROM REPOSITORY
  (subscriptions coach+status; conversations coach order last_message_at DESC; workout_assignments
  coach+client; nutrition_assignments enrollment+scheduled_date).
- Production dependency: all columns VERIFIED LIVE; live table sizes VERIFIED LIVE (16 / 12 / 267 /
  29 rows) — creation cost trivial, write locks negligible; off-peak preferred but not required.
- Redundancy: pre-existing covering indexes NOT VERIFIABLE WITHOUT WRITE (`pg_indexes` unreachable);
  IF NOT EXISTS guards names only. Worst case is a harmless duplicate at this scale.
- Mobile compatibility: none (read accelerators only). Idempotency: IDEMPOTENT.
  Rollback: `DROP INDEX IF EXISTS ×4` (instant, safe).
- Issues: none material. Required changes: none.
- Verdict: **SAFE TO APPLY** (optionally off-peak; re-check `pg_indexes` when catalog access exists).

### Migration 6 — `supabase/foods_trgm_migration.sql`
- Purpose: `pg_trgm` + GIN trigram indexes on `foods.name`, `foods.name_ar` for the
  `ILIKE '%q%'` search VERIFIED FROM REPOSITORY (`api/foods/search/route.ts:24`,
  `lib/nutrition.ts:172`).
- Production dependency: columns VERIFIED LIVE; `foods` = 548 rows VERIFIED LIVE (build cost trivial).
  `pg_trgm` installed/available: NOT VERIFIABLE WITHOUT WRITE (CREATE EXTENSION is itself a write;
  no catalog access). Operator classes/columns correct for substring search.
- Performance assessment: GIN build on 548 rows is instant; ongoing write overhead negligible.
- Mobile compatibility: none (read accelerator). Idempotency: IDEMPOTENT (IF NOT EXISTS both).
- Rollback: DROP INDEX ×2; extension normally left installed (harmless).
- Issues: extension availability is the single gate (MEDIUM, blocks apply, not a defect).
- Required changes: none to SQL.
- Verdict: **SAFE WITH CONDITIONS** — confirm `pg_trgm` (or have the owner pre-run the extension line).

### Migration 7 — appended REVOKE/GRANT blocks (workout + program RPCs)
- Purpose: `REVOKE ALL ... FROM public, anon` + `GRANT EXECUTE ... TO authenticated, service_role` on
  5 functions whose signatures match their CREATE statements exactly VERIFIED FROM REPOSITORY; all 5
  exist live VERIFIED LIVE.
- Security assessment: **the grants narrow anon abuse but preserve an authenticated-IDOR**: function-body
  scan VERIFIED FROM REPOSITORY shows NONE of the 5 bodies reference `auth.uid()`/`auth.role()`
  (`create/update_workout_template_atomic` have no ownership logic at all; the 3 program RPCs check only
  that `p_coach_id` matches the row — any authenticated caller who knows a victim `coaches.id` (and
  `coaches` rows are currently anon-readable) passes). Nutrition RPCs are safe because they check
  `auth.uid()` in-body; these do not. `REVOKE FROM public` semantics: Supabase default PUBLIC EXECUTE
  is removed for anon, kept for authenticated — the residual risk is authenticated, not anon.
- Correctness assessment: no dashboard breakage (routes use service_role, unaffected by grants); mobile
  breakage unlikely (mobile RPC set disjoint) but mobile direct calls to these 5 (if any) would now
  require authentication — INFERRED safe, not proven.
- Overloads: additional same-name overloads NOT VERIFIABLE WITHOUT WRITE (signature-specific
  privileges); re-list RPCs after apply (manual).
- Idempotency: IDEMPOTENT. Rollback: re-GRANT to public (one file, instant).
- Issues: authenticated cross-coach invocation remains (HIGH).
- Required changes: **either** add in-function `auth.uid()` ownership guards mirroring the nutrition
  RPCs, **or** narrow EXECUTE to `service_role` only (no legit JWT callers identified in repo).
- Verdict: **NEEDS CHANGES**.

## CRITICAL ISSUES TABLE

| Severity | Migration | Issue | Evidence | Required Action |
| -------- | --------- | ----- | -------- | --------------- |
| HIGH | #7 RPC grants | `authenticated` EXECUTE retained on 5 RPCs with no in-body `auth.uid()` check; any authed caller can pass a victim `coaches.id` | VERIFIED FROM REPOSITORY: body scan (0/5 reference auth), grant text; VERIFIED LIVE: `coaches` anon-readable, all 5 RPCs present | Add in-function guards or narrow to service_role-only before apply |
| HIGH | #2 role trigger | BEFORE UPDATE only: fresh INSERT of `role='coach'` bypasses; mobile coach-select upsert on existing row would now fail (silently swallowed) | VERIFIED FROM REPOSITORY: trigger DDL + `login_sign_up.dart:508,713` | Product decision on mobile coach signup; do not add INSERT guard unilaterally |
| MEDIUM | #1 lockdown | Coach loses profile reads for lapsed-subscription clients (revenue names, chat names degrade) | VERIFIED FROM REPOSITORY: policy text + dashboard readers; VERIFIED LIVE: schema | Accept explicitly or extend policy to recent/past subscribers |
| MEDIUM | #3 coach edits | `change_log` CHECK values + numeric column types unconfirmed | INFERRED gap: constraints unreachable read-only | One privileged catalog look (manual, read-only) before apply |
| MEDIUM | #6 trigram | `pg_trgm` availability unconfirmed | NOT VERIFIABLE WITHOUT WRITE | Owner confirms/enables extension |
| LOW | #1 lockdown | `stripe_account_id` stays anon-readable via marketplace policy | VERIFIED FROM REPOSITORY + VERIFIED LIVE columns | Accept or later add limited-column view |
| LOW | #5 indexes | Possible pre-existing covering indexes (duplicate, harmless at this scale) | NOT VERIFIABLE WITHOUT WRITE (`pg_indexes` unreachable) | Check when catalog access exists |

## LIVE DATABASE FACTS

Tables (all VERIFIED LIVE, 2026-09-27): profiles, coaches, subscriptions, training_programs (no
`coach_id` column — global catalog, claim VERIFIED LIVE), workout_templates(+exercises), workout_assignments
(267 rows), workout_sessions, workout_sets, nutrition_programs(+days/meals/foods),
client_nutrition_enrollments, nutrition_assignments (29 rows), nutrition_assignment_foods,
nutrition_change_log, nutrition_logs, foods (548 rows, has `name`,`name_ar`), conversations (12 rows),
messages (69 rows), payment_intents (EXISTS, 0 rows), daily_summary, body_measurements, user_goals,
subscription_plans, coach_onboarding, coach_programs(+days), client_program_enrollments, coach_content.
`stripe_webhook_events`: absent (404). Counts VERIFIED LIVE: subscriptions 16, profiles 59, coaches 11.
Anon exposure still live VERIFIED LIVE: `profiles` and `coaches` return 5/5 rows unauthenticated
(migrations correctly still unapplied). Buckets VERIFIED LIVE: avatars/coach-media/coach-pdfs/food-images
public; food-scans/voice-food-logs/chat-voice-notes/chat-images/chat-files private.
RPC inventory VERIFIED LIVE (19): apply_nutrition_food_change, create_nutrition_enrollment_atomic,
create_program_enrollment_atomic, create_workout_template_atomic, update_workout_template_atomic,
upsert_coach_program_atomic, upsert_nutrition_program_atomic,
regenerate_remaining_enrollment_assignments, regenerate_remaining_nutrition_assignments, plus 10
mobile-app RPCs. Absent VERIFIED LIVE: `apply_coach_meal_edit`, `is_coach`. NOT VERIFIABLE WITHOUT WRITE:
policy text, function bodies/grants/owners/search_path, triggers, indexes, extensions, constraints,
exact migration history. No secrets were accessed or printed.

## SQL STATEMENTS REVIEWED

- #1: 2× ALTER ENABLE RLS (safe/no-op), 6× DROP POLICY IF EXISTS + CREATE POLICY, 1 commented block —
  all IDEMPOTENT.
- #2: 2× CREATE OR REPLACE FUNCTION, 1× DROP/CREATE TRIGGER, 8× DROP/CREATE POLICY — all IDEMPOTENT.
  Trigger fires BEFORE UPDATE on profiles only.
- #3: 1× CREATE OR REPLACE FUNCTION (SECURITY DEFINER, fixed search_path) + 1× REVOKE + 1× GRANT —
  IDEMPOTENT; signature matches both call sites.
- #4: 1× CREATE TABLE IF NOT EXISTS + 1× ALTER ENABLE RLS — IDEMPOTENT.
- #5: 4× CREATE INDEX IF NOT EXISTS — IDEMPOTENT (name-guarded).
- #6: 1× CREATE EXTENSION IF NOT EXISTS + 2× CREATE INDEX IF NOT EXISTS (GIN trigram) — IDEMPOTENT.
- #7: 5× (REVOKE ALL FROM public,anon + GRANT TO authenticated,service_role), signature-matched —
  IDEMPOTENT. Full texts (not pasted) at `supabase/workout_templates_migration.sql` §7 and
  `supabase/coach_programs_migration.sql` §7.

## MOBILE COMPATIBILITY

Evidence base is 3 rollback fragments (`rollback/originals/coregymali/lib/*.dart`) — the full mobile app
is NOT in the workspace, so every "no breakage" below carries that caveat.
- profiles SELECT (own row): mobile signup upsert + home-page own reads satisfy `id = auth.uid()` —
  no breakage (migration #1).
- profiles INSERT/UPDATE (own row, any role value incl. 'coach' on fresh rows): passes CHECKs — no
  breakage (migration #1). Role-change-on-existing-row now raises (migration #2) — see coach-signup risk.
- coaches SELECT (active): preserved by both #1 and #2 — marketplace reads unaffected.
- Logged-data tables (daily_summary/nutrition_logs/workout_sessions/workout_sets/body_measurements/
  user_goals): #2 only ADDS subscribed-coach SELECT; own-row access unchanged — no breakage.
- subscription_plans FOR ALL fix: mobile plan reads unaffected (SELECT side preserved); direct
  authenticated plan writes now require real coach ownership (previously impossible-spurious) —
  INFERRED safe.
- RPCs (mobile set): untouched by #3/#7 — no breakage. Indexes/trigram/webhook table: no client impact.
- Possible regressions: (1) mobile coach-role select on an EXISTING profile row fails silently post-#2;
  (2) any undiscovered pre-subscription read of coaches' `profiles` rows breaks post-#1 (optional policy
  covers it, commented out pending product confirmation); (3) any undiscovered direct-JWT use of the 5
  re-granted RPCs by mobile breaks if narrowed to service_role (currently proposed `authenticated`
  keeps them working).

## PRODUCTION APPLY ORDER

If approved, apply in this order (each step independent ROLLBACK-safe; stop on first error):
1. #4 webhook events table — zero dependencies, unblocks dedupe; verify 404→table exists via
   service_role select (read-only check).
2. #5 indexes — independent, instant at current sizes; verify with EXPLAIN on chat/revenue queries.
3. #6 trigram — after confirming `pg_trgm`; verify with EXPLAIN on a food search.
4. #3 coach meal-edit RPC — independent function; verify it appears in the RPC inventory, then
   smoke-test coach add/remove on a fixture enrollment.
5. #2 role updates — after product answers; verify trigger exists and mobile signup still works.
6. #1 profiles/coaches lockdown — LAST (highest blast radius): re-run anon probes expecting 0 rows on
   both tables, then smoke-test dashboard lists + mobile signup/home/marketplace.
7. #7 grants — only AFTER the required change (in-function guards or service_role-only); re-list RPCs
   and probe anon EXECUTE denial.
Rationale: additive/zero-dependency first, authorization changes last, the known-defective item (#7)
held until reworked.

## MANUAL VERIFICATION REQUIRED

- Live `pg_policies` text for profiles/coaches (confirm what #1 replaces; snapshot for rollback).
- Live `pg_proc` rows: security mode/owner/grants for the 5 grant targets + `apply_nutrition_food_change`
  body (S1 residual), `prevent_role_escalation` trigger row.
- `pg_constraint`: `nutrition_change_log` CHECK values and numeric column types for #3.
- `pg_extension`: `pg_trgm` presence for #6. `pg_indexes`: redundancy check for #5.
- Post-apply anon probes (profiles/coaches → 0 rows; RPC anon EXECUTE → denied).
- Post-apply smoke tests: mobile signup (both roles), mobile home, marketplace, coach add/remove food,
  webhook duplicate delivery, dashboard revenue/chat/client lists.
- `Cannot verify without a production write`: actual post-migration anon behavior; trigger firing on a
  real role change; index build locks under production write load.

## FINAL DECISION MATRIX

| # | Migration | Verdict | Blocking Issue |
| - | --------------------- | ------- | -------------- |
| 1 | profiles/coaches RLS | SAFE WITH CONDITIONS | Smoke-test plan + lapsed-subscription read policy decision |
| 2 | role updates | SAFE WITH CONDITIONS | Mobile coach-signup product decision; INSERT-path limitation accepted |
| 3 | nutrition coach edits | SAFE WITH CONDITIONS | One privileged CHECK/type look (fail-safe if skipped, fails loudly) |
| 4 | webhook events | SAFE TO APPLY | none |
| 5 | dashboard indexes | SAFE TO APPLY | none (re-check pg_indexes when possible) |
| 6 | foods trigram | SAFE WITH CONDITIONS | pg_trgm availability |
| 7 | RPC grants/revokes | NEEDS CHANGES | Authenticated-IDOR persists: add in-function guards or service_role-only |

## Questions Requiring Human/Product Decision

1. May a subscribed client convert to coach (S2 gate), and is mobile role-select-'coach' signup a
   supported flow? (Decides #2 blast radius and whether an INSERT guard is ever wanted.)
2. Must coach `profiles` rows (name/avatar) be readable before any subscription — i.e., enable the
   optional marketplace policy or build a limited-column public view? (Decides #1 final shape.)
3. For lapsed/paused subscriptions, should coaches retain profile reads (revenue history, chat names)?
   (Decides whether #1's `status='active'` filter needs widening.)
4. For the 5 workout/program RPCs: add in-function `auth.uid()` guards (mirroring nutrition) or narrow
   EXECUTE to `service_role` only? (Unblocks #7.)
5. Is `coaches.stripe_account_id` public visibility acceptable long-term, or is a limited-column
   marketplace view wanted? (Residual LOW from #1.)
