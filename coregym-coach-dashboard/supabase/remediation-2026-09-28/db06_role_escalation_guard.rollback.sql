-- ============================================================================
-- DB-06 ROLLBACK — removes the role-escalation guard, restoring the current
-- live no-guard state (self-promotion via direct profile updates becomes
-- possible again). Run only if the guard causes a verified production
-- regression that cannot be fixed forward.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_role_escalation();
