-- ============================================================================
-- API-06 (P2) — atomic unread-counter increment for conversations.
-- NOT APPLIED YET. Until applied, the workout-feedback route falls back to
-- the legacy read-modify-write automatically (Postgres 42883 detection), so
-- this migration is safe to schedule independently.
-- ROLLBACK: api06_unread_atomic.rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bump_conversation_unread(
  p_conversation_id uuid,
  p_for_coach boolean
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Single-statement increment: no read-modify-write window, so concurrent
  -- messages from the mobile app and the dashboard can no longer lose
  -- unread increments (API-06 race).
  UPDATE public.conversations
  SET client_unread = client_unread + CASE WHEN p_for_coach THEN 0 ELSE 1 END,
      coach_unread  = coach_unread  + CASE WHEN p_for_coach THEN 1 ELSE 0 END
  WHERE id = p_conversation_id;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_conversation_unread(uuid, boolean) FROM public, anon;
GRANT EXECUTE  ON FUNCTION public.bump_conversation_unread(uuid, boolean) TO authenticated, service_role;
