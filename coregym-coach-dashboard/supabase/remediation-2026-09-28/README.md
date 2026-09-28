# Remediation migrations — 2026-09-28 (v2, reconciled against live)

Prepared against baseline `b03161f`, reconciled on 2026-09-28 against the
LIVE database via Management-API SELECT introspection (project
`mkrjvrnysuvtokqkyoll`). **NONE of these have been applied.** Every forward
file embeds its own introspect-apply-verify runbook and has a matching
`.rollback.sql` that restores the exact live pre-state captured during
introspection.

## Live facts this reconciliation is built on

* RLS is ENABLED on all 58 public tables (the leak is permissive policies,
  not missing RLS).
* The anon PII/health leak comes from `profiles_select_public` (the
  `role = 'coach'` OR-term) and `coaches_read_all` — NOT from disabled RLS.
* `coach_content`, `coach_onboarding`, `notification_preferences`,
  `daily_summary` already have correct live policies — do not touch.
* `subscription_plans.coach_manage_own_plans` is live, broken (TO public,
  `coach_id = auth.uid()`), and fail-closes coach plan reads.
* `is_coach` / `prevent_role_escalation` / ownership triggers /
  `bump_conversation_unread` / stripe webhook schema: all ABSENT live.
* `is_my_active_client(client_uid uuid)` is live, SECURITY DEFINER, without
  `search_path`.
* Indexes already live: messages(conversation_id, created_at DESC),
  coaches(user_id) UNIQUE, daily_summary(user_id, summary_date) — do not
  recreate.
* Live `create_program_enrollment_atomic` matches the b03161f body and lacks
  the 1–52 cap.

## Apply order (later APPLY run — WITH verification at each step)

| # | File | Fixes | Condition / notes |
|---|------|-------|--------------------|
| 1 | `db06_role_escalation_guard.sql` | role self-promotion guard | **PRODUCT DECISION REQUIRED** — blocks mobile signup role-pick (see file header). S2-conditional alternative included commented. |
| 2 | `db01_profiles_coaches_lockdown.sql` | DB-01 (P0 anon PII/health leak) | mandatory. Probe-verify immediately after. |
| 3 | `api01_enrollment_duration_cap.sql` | API-01 (RPC half) | mandatory (route cap already in code). |
| 4 | `api04_tenant_id_immutability.sql` | API-04 (DB guard) | mandatory. |
| 5 | `api06_unread_atomic.sql` | API-06 | safe pre-deploy (route has fallback). |
| 6 | `db05_plans_policy_fix.sql` | DB-05 | fixes live fail-closed coach plan reads. |
| 7 | `db02_performance_indexes.sql` | DB-02 (6 indexes) | off-peak; re-check equivalents first. |
| 8 | `db04_function_hardening.sql` | DB-04 | includes live `is_my_active_client`. |
| 9 | `str02_webhook_idempotency_ordering.sql` | STR-02/03 | **must precede the next dashboard deploy** (new webhook code 503s without it). |

## Post-apply probe expectations

* `GET /rest/v1/profiles?select=*&limit=1` (anon) → `[]` (200)
* `GET /rest/v1/coaches?select=*&limit=1` (anon) → permission error (column
  grant); `?select=id,bio,is_active&...` → rows WITHOUT `stripe_account_id`/
  `user_id`
* `GET /rest/v1/foods?select=*&limit=50` (anon) → catalog rows only
  (`is_custom` false/null)
* authenticated PATCH of own profile role → error (db06)

## Mobile compatibility notes

* Mobile profile reads are own-row; unaffected by db01.
* Mobile marketplace discovery (if it queries `coaches` as anon) must select
  the safe columns — `select=*` will be denied by the column grant. This is a
  documented mobile-side change; do not re-widen the grant instead.
* Mobile signup that upserts `role='coach'` will be rejected by db06 — mobile
  must route coach onboarding through the dashboard API (or adopt the
  S2-conditional variant after a product decision).
* Mobile custom-food creation (authenticated, `created_by` = self) keeps
  working under auth01; anonymous public-row inserts are closed.
