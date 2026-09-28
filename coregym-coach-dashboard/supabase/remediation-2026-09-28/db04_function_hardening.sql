-- ============================================================================
-- DB-04 (P2) — harden SECURITY DEFINER helper functions: SET search_path.
-- NOT APPLIED YET.
--
-- Audit finding: is_coach() (defined in BOTH schema.sql:177 and
-- rls_role_updates.sql:49 with different bodies) and prevent_role_escalation()
-- (rls_role_updates.sql:26) are SECURITY DEFINER without `SET search_path`, so
-- a malicious schema-qualified object could shadow auth.uid()/profiles/coaches
-- inside them and execute as the definer. All business RPCs already set
-- `search_path = public` correctly.
--
-- Live state is UNKNOWN: the prior session's live verification reported
-- is_coach() ABSENT from the live DB (remediation-log, LV1 notes), and
-- rls_role_updates.sql may never have been applied. Every statement is
-- therefore wrapped in a DO block that skips missing functions instead of
-- failing the whole file.
--
-- EXECUTE grants: intentionally NOT tightened in this run. is_coach() may be
-- evaluated by RLS policies for any role (including anon), so revoking PUBLIC
-- EXECUTE without live pg_proc/policy introspection could break live policies.
-- The injection-class risk is fully neutralized by SET search_path. Revisit
-- grants after live introspection. ROLLBACK: db04_function_hardening.rollback.sql
-- ============================================================================

DO $$
BEGIN
  ALTER FUNCTION public.is_coach() SET search_path = public;
  RAISE NOTICE 'is_coach(): search_path set';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'is_coach() not present in live DB — skipped';
END $$;

DO $$
BEGIN
  ALTER FUNCTION public.prevent_role_escalation() SET search_path = public;
  RAISE NOTICE 'prevent_role_escalation(): search_path set';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'prevent_role_escalation() not present in live DB — skipped';
END $$;

-- Verify: select proname, prosecdef, proconfig from pg_proc
--         where proname in ('is_coach','prevent_role_escalation');
--         proconfig should contain "search_path=public".
