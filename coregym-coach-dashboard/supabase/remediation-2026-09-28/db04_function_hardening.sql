-- ============================================================================
-- DB-04 v2 (P2) — SECURITY DEFINER search_path hardening, reconciled against
-- LIVE introspection 2026-09-28. NOT APPLIED.
--
-- Live state (verified):
--   is_coach()                   ABSENT  (skip — DO block no-ops)
--   prevent_role_escalation()    ABSENT  (skip — DO block no-ops; db06 creates
--                                        its own hardened version)
--   is_my_active_client()        PRESENT, SECURITY DEFINER, NO search_path
--                                        <- the real live gap this file fixes
--   All business RPCs (create_program_enrollment_atomic, unread_count,
--   mark_conversation_read, ...) already SET search_path = public.
--
-- EXECUTE grants intentionally untouched: policies may evaluate these helpers
-- for any role; revoking PUBLIC EXECUTE without full policy introspection
-- could break live policies. The injection-class risk is neutralized by
-- search_path alone. ROLLBACK: db04_function_hardening.rollback.sql
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

-- The live gap: is_my_active_client() is SECURITY DEFINER without a fixed
-- search_path — a schema-qualified object could shadow auth.uid() or the
-- subscriptions/coaches tables inside it and execute as the definer.
-- Signature verified live: is_my_active_client(client_uid uuid).
ALTER FUNCTION public.is_my_active_client(client_uid uuid) SET search_path = public;

-- Verify: select proname, proconfig from pg_proc
--         where proname in ('is_coach','prevent_role_escalation','is_my_active_client');
--         is_my_active_client.proconfig must contain "search_path=public".

-- ============================================================================
-- v3 ADDITION (2026-10-02, reconciled against the LIVE catalog dump in
-- docs/live-db-introspection-2026-10-02/): the Sep-28 reconciliation predates
-- several live functions. Today's live state has SEVEN secdef functions
-- without pinned search_path; only is_my_active_client is covered above.
-- The six below are trigger-shaped (zero args) but ARE callable via
-- PostgREST rpc/ because of PUBLIC EXECUTE — pin their search_path too.
-- Signatures verified live 2026-10-02 (all zero-arg).
-- ============================================================================
ALTER FUNCTION public.handle_subscription_accepted() SET search_path = public;
ALTER FUNCTION public.notify_new_message() SET search_path = public;
ALTER FUNCTION public.sync_nutrition_to_summary() SET search_path = public;
ALTER FUNCTION public.sync_workout_to_summary() SET search_path = public;
ALTER FUNCTION public.update_coach_rating() SET search_path = public;
ALTER FUNCTION public.update_conversation_on_message() SET search_path = public;

-- Grant tightening (NEW, evidence-based): these two are USER-facing analytics
-- RPCs, not policy helpers — PUBLIC/anon EXECUTE is inconsistent with their
-- siblings (get_leaderboard etc. are authenticated-only). authenticated X
-- already present in the live ACL, so mobile (authenticated JWT) keeps
-- working; verify with a mobile smoke test after apply.
REVOKE EXECUTE ON FUNCTION public.record_daily_activity(text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_streak_status() FROM public, anon;

-- Verify: select proname, proconfig from pg_proc where proname in
--          ('handle_subscription_accepted','notify_new_message','sync_nutrition_to_summary',
--           'sync_workout_to_summary','update_coach_rating','update_conversation_on_message');
--         all proconfig must contain "search_path=public".
-- Verify: select proname, proacl::text from pg_proc
--         where proname in ('record_daily_activity','get_streak_status');
--         proacl must NOT contain "=X" or "anon=X" entries.
