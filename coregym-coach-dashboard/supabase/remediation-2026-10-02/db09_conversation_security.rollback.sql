-- ============================================================================
-- db09_conversation_security.rollback.sql
-- Restores the EXACT live pre-state captured 2026-10-02 (introspection):
--   * both original conversations INSERT policies
--   * no update-scope trigger/function on messages
--   * (no index step — the live UNIQUE constraint conversations_client_id_coach_id_key
--     predates this migration and is untouched by forward + rollback)
-- Run step-wise; verify after.
-- ============================================================================

-- ── reverse Step 3 ─────────────────────────────────────────────────────────
BEGIN;
DROP TRIGGER IF EXISTS trg_message_update_scope ON public.messages;
DROP FUNCTION IF EXISTS public.enforce_message_update_scope();
COMMIT;

-- ── reverse Step 2 (restore original policies verbatim) ───────────────────
BEGIN;
DROP POLICY IF EXISTS conv_insert ON public.conversations;

CREATE POLICY authenticated_can_create_conversations ON public.conversations
  FOR INSERT TO public
  WITH CHECK (
    (client_id = auth.uid()) OR (coach_id = auth.uid())
  );

CREATE POLICY conv_insert ON public.conversations
  FOR INSERT TO public
  WITH CHECK (
    (auth.uid() = client_id) OR (auth.uid() = coach_id)
  );
COMMIT;
