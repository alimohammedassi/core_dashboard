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

-- ============================================================================
-- v3 ROLLBACK (2026-10-02 additions) — restore live pre-state: no search_path
-- override, PUBLIC+anon EXECUTE present on the two analytics RPCs.
-- ============================================================================

ALTER FUNCTION public.handle_subscription_accepted() RESET search_path;
ALTER FUNCTION public.notify_new_message() RESET search_path;
ALTER FUNCTION public.sync_nutrition_to_summary() RESET search_path;
ALTER FUNCTION public.sync_workout_to_summary() RESET search_path;
ALTER FUNCTION public.update_coach_rating() RESET search_path;
ALTER FUNCTION public.update_conversation_on_message() RESET search_path;

GRANT EXECUTE ON FUNCTION public.record_daily_activity(text) TO public, anon;
GRANT EXECUTE ON FUNCTION public.get_streak_status() TO public, anon;
