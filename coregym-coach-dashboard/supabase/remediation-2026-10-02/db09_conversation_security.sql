-- =====================================================================
-- db09_conversation_security.sql — S-03 + F-01 + message-tampering guard
-- PREPARED 2026-10-02. ** NOT EXECUTED — awaiting explicit authorization. **
-- Target: production project mkrjvrnysuvtokqkyoll (shared dashboard + Flutter).
-- Baseline verified live 2026-10-02 via Management-API introspection:
--   * conversations INSERT policies (2, both permissive-OR):
--       authenticated_can_create_conversations: WITH CHECK (client_id = auth.uid() OR coach_id = auth.uid())
--       conv_insert:                            WITH CHECK (auth.uid() = client_id OR auth.uid() = coach_id)
--     → any authenticated user can open a conversation pairing ANY two
--       accounts (no subscription check). Empirically confirmed: a
--       coach→foreign-client INSERT returned 201 (test row deleted after).
--   * conversations UNIQUE constraint `conversations_client_id_coach_id_key`
--     on (client_id, coach_id) verified live 2026-10-02 evening re-check
--     (an earlier probe wrongly reported its absence). Duplicate-pair count 0.
--     → NO new index is created by this migration (a second index would be
--     redundant); the find-or-create race in F-01 is already DB-prevented.
--   * messages UPDATE: msg_update (sender) OR participants_can_update_messages
--     (any participant) → a participant can rewrite the OTHER party's
--     message content/file_url. Only is_read needs participant-wide access
--     (dashboard + mobile read receipts).
--
-- WHAT THIS FIX DOES
--   1. (REMOVED — live UNIQUE constraint already covers pair uniqueness.)
--   2. Replaces both INSERT policies with ONE subscription-verified policy:
--      a conversation may be created only when the two endpoints are paired
--      by an ACTIVE subscription (coach-initiated: client is my active
--      client; client-initiated: I am the coach's active client).
--   3. BEFORE UPDATE trigger on messages: a participant who is not the
--      sender may change ONLY is_read; content/type/file_url/is_deleted/
--      conversation_id/sender_id changes by non-senders are rejected.
--
-- REQUIRED CONFIRMATIONS BEFORE APPLY (do not skip)
--   [ ] PRODUCT: is pre-subscription "inquiry chat" a client flow? The new
--       policy requires an ACTIVE subscription for BOTH creation directions.
--       All 15 live conversations are consistent with subscription-based
--       chat; Flutter usage was inspected from docs only (repo unavailable).
--   [ ] MOBILE SMOKE TEST after apply: client opens chat with own coach
--       (create + send), coach opens chat with own client, read receipts
--       still flip is_read both ways.
--
-- RUNBOOK (execute each step separately; verify between steps)
--   Step 0 (introspect current state):
--     select policyname, cmd, with_check from pg_policies
--      where schemaname='public' and tablename='conversations';
--     select conname, pg_get_constraintdef(oid) from pg_constraint
--      where conrelid='public.conversations'::regclass;
--   Step 2: policy drop/recreate block below (single transaction OK).
--   Step 3: trigger + function block below (single transaction OK).
--   Step 4 (verify):
--     * anon INSERT  → 401 (unchanged)
--     * authenticated INSERT pairing two arbitrary uids → policy error
--       (42501), no row
--     * authenticated INSERT with own active client → 201 (delete after)
--     * duplicate INSERT of same pair → unique-violation (23505) from the
--       existing conversations_client_id_coach_id_key constraint
--     * participant UPDATE of foreign message content → exception
--     * participant UPDATE of is_read → OK
--     * mobile smoke test (see REQUIRED CONFIRMATIONS)
-- =====================================================================

-- ── Step 2: subscription-verified creation (S-03) ─────────────────────────
BEGIN;

DROP POLICY IF EXISTS authenticated_can_create_conversations ON public.conversations;
DROP POLICY IF EXISTS conv_insert ON public.conversations;

CREATE POLICY conv_insert ON public.conversations
  FOR INSERT TO public
  WITH CHECK (
    (
      coach_id = auth.uid()
      AND client_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM subscriptions s
        JOIN coaches c ON c.id = s.coach_id
        WHERE s.client_id = conversations.client_id
          AND c.user_id = auth.uid()
          AND s.status = 'active'
      )
    )
    OR
    (
      client_id = auth.uid()
      AND coach_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM subscriptions s
        JOIN coaches c ON c.id = s.coach_id
        WHERE s.client_id = auth.uid()
          AND c.user_id = conversations.coach_id
          AND s.status = 'active'
      )
    )
  );

COMMIT;

-- ── Step 3: message tampering guard (participants may only set is_read) ───
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_message_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Sender (or service/definer context with no JWT) keeps full control.
  IF auth.uid() IS NULL OR auth.uid() = NEW.sender_id THEN
    RETURN NEW;
  END IF;
  -- Non-sender participant: read-state only (dashboard + mobile receipts).
  IF OLD.is_read IS DISTINCT FROM NEW.is_read
     AND OLD.content      IS NOT DISTINCT FROM NEW.content
     AND OLD.type         IS NOT DISTINCT FROM NEW.type
     AND OLD.file_url     IS NOT DISTINCT FROM NEW.file_url
     AND OLD.is_deleted   IS NOT DISTINCT FROM NEW.is_deleted
     AND OLD.conversation_id IS NOT DISTINCT FROM NEW.conversation_id
     AND OLD.sender_id    IS NOT DISTINCT FROM NEW.sender_id THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Not authorized: participants may only set is_read on messages they did not send';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_message_update_scope ON public.messages;
CREATE TRIGGER trg_message_update_scope
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_update_scope();

COMMIT;
