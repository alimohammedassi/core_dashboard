# Remediation Baseline — 2026-10-02

Full-audit-remediation baseline captured before any modification. Read-only phase.

## Git / environment

- Repo: `F:\core_Dashboard\core_dashboard` (branch `main` @ `bec37bc`, ahead of origin/main by 22, unpushed — intentionally untouched)
- Project dir: `coregym-coach-dashboard/`
- Node v24.13.1, npm 11.19.1, Next 16.3.4, React 19.2.8, TS 5, Tailwind 4, supabase CLI 2.119.0 (NOT authenticated)
- No direct Postgres connection string available. Supabase Management API: 401 (per 2026-09-27 report).
  → SQL/DDL cannot be executed from this environment; PostgREST probes (anon/service_role) + real-UI QA are the verification path.

## Pre-existing uncommitted changes (PROTECTED — design agent / parallel work)

Modified (do not touch without critical security justification):
- `src/app/(auth)/login/page.tsx`, `signup/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`
- `src/components/core/StatCard.tsx`
- `src/lib/i18n/domains/auth.ts`
- `src/components/nutrition/NutritionClient.tsx` (not on the protected list but uncommitted — treated as protected; likely design typography continuation)

Untracked (protected): `src/components/auth/**`

## Baseline measurements (2026-10-02)

- `npx tsc --noEmit`: clean (exit 0)
- `npm run lint`: clean (exit 0)
- `npm test`: **209/209 pass**, 0 fail (15 files)
- `npm run build`: success (exit 0, 39 routes, Turbopack)
- `npm audit`: last measured 0 vulnerabilities (2026-09-27, prior report)

## Existing SQL remediation inventory

`supabase/remediation-2026-09-28/` (v2, reconciled against live) — **NONE APPLIED**:
db01_profiles_coaches_lockdown, db02_performance_indexes, db04_function_hardening,
db05_plans_policy_fix, db06_role_escalation_guard, api01_enrollment_duration_cap,
api04_tenant_id_immutability, api06_unread_atomic, str02_webhook_idempotency_ordering
(+ matching `.rollback.sql` each). Apply-order runbook in that folder's README.

Root-level `supabase/`: rls_profiles_coaches_lockdown.sql, rls_role_updates.sql,
nutrition_coach_edits_migration.sql, stripe_webhook_events_migration.sql,
dashboard_performance_indexes_migration.sql, foods_trgm_migration.sql — also NOT applied live.

Live facts (from Sep 28 reconciliation): RLS enabled on all 58 tables; anon PII leak via
`profiles_select_public` + `coaches_read_all` policies; `subscription_plans.coach_manage_own_plans`
live and broken (fail-closes coach reads); `is_coach`/`prevent_role_escalation`/ownership triggers/
`bump_conversation_unread`/stripe-webhook schema ABSENT live; `is_my_active_client()` live without
search_path; indexes live: messages(conversation_id,created_at DESC), coaches(user_id) UNIQUE,
daily_summary(user_id,summary_date).

## QA infrastructure available

- Credentials: `scripts/.qa-credentials.local.json` (gitignored; never print)
- PostgREST probe pattern: `scripts/probe-rls.mjs`, `scripts/introspect.mjs`
- Real-UI driver: `F:\core_Dashboard\_qa_pw\driver.mjs` (playwright-core, Edge profile, localhost:3000, magic-link login as coachmohammed@gmail.com)
- Test account: coachmohammed@gmail.com (KEEP; do not delete any audit fixtures)
- Load-test history: `docs/loadtest-results.json`

## Verification environment note

All pages/APIs run against the PRODUCTION Supabase project (`mkrjvrnysuvtokqkyoll`) even in local dev.
Every mutation during QA must be created-tagged, recorded, and cleaned up; existing audit data is read-only.
