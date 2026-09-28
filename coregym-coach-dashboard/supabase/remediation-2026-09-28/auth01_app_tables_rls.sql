-- ============================================================================
-- AUTH-01 v2 / DB-01b (P1) — reconciled against LIVE introspection 2026-09-28.
-- NOT APPLIED.
--
-- v2 SHRINKS the original migration: live inspection proved that
-- coach_content, coach_onboarding, notification_preferences and daily_summary
-- ALREADY have correct least-privilege policies live (including a live
-- is_my_active_client() helper and a richer coach_content subscriber-read
-- rule using an is_public column). Recreating them would add duplicate
-- permissive policies for no benefit. Only two genuine gaps remain:
--
--   1) user_goals — live own-row CRUD exists, but NO coach-read policy.
--      The dashboard reads a CLIENT's goals via the coach's user session
--      (overview.ts, subscribers/[id]) — currently fail-closed, so goal
--      sections render empty. This adds the coach-read capability using the
--      same active-subscription ownership model as the profiles policy.
--      (Equivalent alternative: the live is_my_active_client(user_id)
--      helper used by daily_summary's policy — kept explicit here so the
--      policy is self-contained and auditable.)
--
--   2) foods — live `foods_select` is `USING (true)` (fully public, including
--      other users' is_custom rows) and live `foods_insert` allows ANON to
--      insert public (is_custom=false) rows. Replaced with: public read of
--      the catalog only (custom rows visible to their creator), and
--      insert/update/delete restricted to authenticated owners. The public
--      catalog stays readable for dashboard + mobile food search.
--
-- Idempotent. NOT APPLIED. Rollback: auth01_app_tables_rls.rollback.sql
-- (restores the exact live policies documented below).
-- ============================================================================

-- ── 1) user_goals — add ONLY the missing coach-read capability ──────────────
-- Live own-row CRUD policies (goals_select/insert/update/delete, TO public,
-- user_id = auth.uid()) are correct and intentionally untouched.
-- RLS is already enabled live (no-op kept for idempotency).
ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_goals_coach_read" ON public.user_goals;
CREATE POLICY "user_goals_coach_read" ON public.user_goals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.coaches c ON c.id = s.coach_id
      WHERE s.client_id = user_goals.user_id
        AND c.user_id = auth.uid()
        AND s.status = 'active'
    )
  );

-- ── 2) foods — replace fully-public read with catalog + owner rules ─────────
-- Live (verified): foods_select USING (true) TO public;
--                  foods_insert FOR INSERT TO public
--                    WITH CHECK ((auth.uid() = created_by) OR (is_custom = false)).
-- RLS is already enabled live.
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "foods_select" ON public.foods;
CREATE POLICY "foods_select_catalog" ON public.foods
  FOR SELECT
  USING (is_custom IS NOT TRUE OR created_by = auth.uid());

-- Close the anon-insert hole: only authenticated owners can add rows
-- (mobile custom-food creation keeps working; anonymous catalog seeding is
-- a service-role task, as it is today in practice).
DROP POLICY IF EXISTS "foods_insert" ON public.foods;
CREATE POLICY "foods_insert_own" ON public.foods
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- No UPDATE/DELETE policies are added: live has none, so mobile custom-food
-- editing is already fail-closed today and this migration does not change it.

-- ============================================================================
-- RUNBOOK:
--   1. Save pre-state (pg_policies for user_goals + foods) — the rollback
--      restores exactly the policies documented above.
--   2. Apply.
--   3. Verify anon:  foods?select=*&limit=50  -> rows ONLY where is_custom
--      is false/null; foods POST (anon) -> 401/403.
--   4. Verify coach (authenticated): overview/subscriber goal sections now
--      populate for active clients; foods search still returns the catalog
--      plus the coach's own custom rows.
--   5. MOBILE smoke test: food search (catalog), custom-food creation
--      (authenticated), own goal reads.
-- ============================================================================
