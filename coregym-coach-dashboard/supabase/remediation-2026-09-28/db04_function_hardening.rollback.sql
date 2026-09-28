-- ============================================================================
-- DB-04 v2 ROLLBACK — clears the search_path overrides added by the forward
-- migration, restoring the pre-migration state (absent functions no-op).
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

ALTER FUNCTION public.is_my_active_client(client_uid uuid) RESET search_path;
