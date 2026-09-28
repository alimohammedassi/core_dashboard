-- ============================================================================
-- DB-04 ROLLBACK — clears the search_path override added by the forward
-- migration, restoring the (insecure) pre-state. Run only on a verified
-- regression caused specifically by the search_path change.
-- ============================================================================

DO $$
BEGIN
  ALTER FUNCTION public.is_coach() RESET search_path;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'is_coach() not present — skipped';
END $$;

DO $$
BEGIN
  ALTER FUNCTION public.prevent_role_escalation() RESET search_path;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'prevent_role_escalation() not present — skipped';
END $$;
