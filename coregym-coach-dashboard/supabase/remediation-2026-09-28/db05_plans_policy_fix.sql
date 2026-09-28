-- ============================================================================
-- DB-05 v2 (P2) — fix the broken live `coach_manage_own_plans` policy on
-- subscription_plans. Reconciled against LIVE introspection 2026-09-28.
-- NOT APPLIED.
--
-- Live (verified verbatim):
--   coach_manage_own_plans · ALL · TO public
--       USING  (coach_id = auth.uid())
--       WITH CHECK (coach_id = auth.uid())
--   -> never matches: subscription_plans.coach_id is keyed to coaches.id while
--      auth.uid() is the auth user id. Coach plan management via the user
--      context is fail-closed (the dashboard compensates with service-role
--      writes; coaches' own plan reads return empty).
--   client_read_subscribed_plans · SELECT · TO public · subscription-join
--   -> CORRECT and intentionally PRESERVED UNTOUCHED.
--
-- Fix: drop the broken policy and recreate it under the same name, corrected
-- to TO authenticated with an EXISTS through coaches (the same ownership
-- model used everywhere else). No broader public read is added.
-- Idempotent. ROLLBACK: db05_plans_policy_fix.rollback.sql restores the exact
-- broken policy text above.
-- ============================================================================

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY; -- already enabled live; idempotent

DROP POLICY IF EXISTS "coach_manage_own_plans" ON public.subscription_plans;
CREATE POLICY "coach_manage_own_plans" ON public.subscription_plans
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coaches c
      WHERE c.id = subscription_plans.coach_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.coaches c
      WHERE c.id = subscription_plans.coach_id
        AND c.user_id = auth.uid()
    )
  );

-- client_read_subscribed_plans is NOT dropped or recreated — it is correct
-- live (verified verbatim) and must survive this migration unchanged.

-- ============================================================================
-- RUNBOOK:
--   1. Save pre-state (pg_policies for subscription_plans) — the rollback
--      recreates the broken policy verbatim.
--   2. Apply.
--   3. Verify: /dashboard/plans shows the coach's own plans (user-session
--      read now matches); plan create/edit via the dashboard still works
--      (service-role writes unaffected); a subscribed client still sees the
--      plan they are enrolled in; anon sees no plan rows.
-- ============================================================================
