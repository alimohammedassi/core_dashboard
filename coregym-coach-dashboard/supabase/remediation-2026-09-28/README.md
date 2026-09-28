# Remediation migrations — 2026-09-28

Prepared by the remediation run of 2026-09-28 against baseline `b03161f`.
**NONE of these have been applied** — the run had no live-database access
(no psql, no supabase CLI, no management token). Every file is written to be
idempotent or explicitly conditional, and every forward migration has a
matching `.rollback.sql`.

## Apply order (next run, WITH live DB access)

| # | File | Fixes | Condition to apply |
|---|------|-------|--------------------|
| 0 | (runbook step in each file) | introspect pre-state | always |
| 1 | `db01_profiles_coaches_lockdown.sql` | DB-01 (P0 live leak) | mandatory |
| 2 | `auth01_app_tables_rls.sql` | AUTH-01 + DB-01b | mandatory (verify column names) |
| 3 | `db02_performance_indexes.sql` | DB-02 | skip statements whose equivalent index already exists |
| 4 | `db05_plans_policy_fix.sql` | DB-05 | only if introspection confirms the broken policy |
| 5 | `db04_function_hardening.sql` | DB-04 | safe no-op if functions absent |
| 6 | `api01_enrollment_duration_cap.sql` | API-01 (RPC half) | mandatory (route cap is already code) |
| 7 | `api04_tenant_id_immutability.sql` | API-04 (DB guard) | mandatory (verify all tables exist) |
| 8 | `str02_webhook_idempotency_ordering.sql` | STR-02/03 | **must precede the next deploy** (new webhook code fails closed without it) |

## Apply/verify rules

1. Save the introspection output for every object before touching it (queries
   are embedded in each file's runbook section).
2. Apply one file at a time; re-run the anon REST probes after files 1 and 2:
   - `GET /rest/v1/profiles?select=*&limit=1` must return `[]`
   - `GET /rest/v1/coaches?select=*&limit=1` must be denied or contain no
     `stripe_account_id` / `user_id`
3. Smoke-test the mobile app after files 1 and 2 (marketplace discovery, coach
   profile view, chat) — the coaches column grant and the profiles policies are
   the two changes that can affect mobile readers.
4. If any step regresses production behavior, use the matching `.rollback.sql`
   and document what happened before retrying a corrected version.
