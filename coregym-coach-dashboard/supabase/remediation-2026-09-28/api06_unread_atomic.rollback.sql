-- ============================================================================
-- API-06 ROLLBACK — drops the atomic unread increment RPC. The workout-feedback
-- route automatically reverts to the legacy read-modify-write fallback.
-- ============================================================================

DROP FUNCTION IF EXISTS public.bump_conversation_unread(uuid, boolean);
