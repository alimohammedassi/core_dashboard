# Remediation Execution & Dependency Map — 2026-10-02

Companion to `docs/remediation-baseline-2026-10-02.md`. Master order per the remediation task:
Security → Authorization → Cross-platform → Realtime → Functional → Performance → UX → Regression.

## Wave A (running, parallel, isolated ownership)

| Agent | Scope | Output | Edits |
| --- | --- | --- | --- |
| security-prober | Live PostgREST probe matrix (anon/authed/foreign), S-03 controlled insert+cleanup, S-06/S-08/F-01 code reading | docs/security-probe-2026-10-02.md | probe scripts only |
| rpc-auditor | All repo SQL functions vs live RPC inventory; route-level pre-reads; db04 coverage verdict | docs/rpc-audit-2026-10-02.md | none |
| storage-auditor | Bucket usage audit + live anon probes; db07 SQL if gaps | docs/storage-audit-2026-10-02.md, supabase/remediation-2026-10-02/db07* | new SQL only |
| realtime-auditor | F-20 root cause; db08 publication migration runbook | docs/realtime-audit-2026-10-02.md, supabase/remediation-2026-10-02/db08* | new SQL only |
| functional-engineer | F-01, F-03, F-11, F-12, F-13, F-14, F-16, F-17 + app-level double-submit guards | per-finding report | dashboard pages/api/lib/tests |

PROTECTED (never edit): `(auth)` pages ×4, `StatCard.tsx`, `i18n/domains/auth.ts`, `components/auth/**`, `NutritionClient.tsx`.

## Wave B (after wave A)

1. **Security code fixes** (security-engineer agent): S-06 normalize existence oracle, S-08 rate-limit gaps on authenticated mutation routes, S-03 conversation-creation app-level guard, any S-01/S-02 residual code hardening. SQL files prepared by wave A stay NOT EXECUTED.
   - U-04 (lead, direct): add `'unsafe-eval'` to CSP script-src ONLY when `NODE_ENV !== "production"` in `next.config.ts` — clears the dev warning without weakening production headers.
   - S-08 inventory (lead, verified 2026-10-02): rate-limit helper used by ai/analysis, chat/upload, coach/clients/search, export/subscribers, revenue/export, stripe/connect. UNPROTECTED mutations (24 routes): ai/proposal-apply, chat/attachments, client-nutrition/change + complete, coach/profile PATCH, coach-programs CUD, coaches POST, nutrition-assignments/[id]/foods, nutrition-enrollments + regenerate, nutrition-programs CUD + duplicate, plans PATCH/POST, program-enrollments POST/PATCH/DELETE + regenerate, workout-assignments POST, workout-feedback POST, workout-templates CUD + duplicate. Plan: tight limits on AI + attachment-minting + coaches + exports; skip plain coach CRUD (auth+RLS sufficient; 60s cooldowns would break legit flows) — document reasoning.
   - DESIGN AGENT IS WORKING CONCURRENTLY in this tree (new changes appeared post-baseline: overview.ts + TopClientsTable.tsx avatar work). Re-snapshot `git status` before every dispatch; treat any file modified-at-dispatch-time as protected for that agent.
2. **Performance agent** (P-01..P-12): measure BEFORE (local dev timings + query counting), then P-01/P-03/P-05 query work, P-06 dynamic imports with bundle measurement, P-08..P-12 trims, P-04 getUser dedupe only if fail-closed auth preserved. File overlap with functional agent is why this is sequenced after.
3. **UX agent** (U-01..U-08 + error-boundary completeness): after functional fixes land (builder initial state U-06 shares workouts files with F-12/F-17).

## Phase 7 (wave C)

- Real-UI E2E (browser, localhost:3000 + production Supabase): full dashboard regression per master prompt §5 PHASE 7.
- Adversarial E2E: cross-coach IDOR via real session + direct API/Supabase calls; storage URL checks.
- Realtime live test (F-20): dashboard↔dashboard message INSERT/UPDATE, unread, multi-tab. (Publication SQL may be UNAPPLIED — if so, realtime verification documents the pre-SQL failing state and the post-SQL expectation.)

## SQL apply-order runbook (all NOT EXECUTED — needs live DB access)

Order (dependency + risk, from remediation-2026-09-28 README + this round):
1. `db06_role_escalation_guard.sql` (PRODUCT DECISION REQUIRED — blocks mobile role-pick)
2. `db01_profiles_coaches_lockdown.sql` (S-01/S-02; probe-verify immediately)
3. `api01_enrollment_duration_cap.sql`
4. `api04_tenant_id_immutability.sql`
5. `api06_unread_atomic.sql`
6. `db05_plans_policy_fix.sql` (S-07)
7. `db02_performance_indexes.sql` (off-peak)
8. `db04_function_hardening.sql` (per rpc-audit verdict)
9. `str02_webhook_idempotency_ordering.sql` (must precede next deploy)
10. `db07_storage_policies.sql` (this round, if storage audit requires)
11. `db08_realtime_publication.sql` (F-20; this round)

Each: read forward + rollback → introspect live state → apply ONE file → probe-verify → record. Never bundle.

## Known blockers / manual actions

- No live DDL access from this environment: all SQL above requires the owner to apply (STOP-AND-ASK list).
- STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET missing in Vercel Production (LV2) — owner action.
- Flutter runtime verification unavailable (separate repo) — query-pattern compatibility documented per change.
- F-15: verified already-handled in design agent's current code (reset-password toasts mismatch; signup has no confirm field). Handoff note only; no edits.
