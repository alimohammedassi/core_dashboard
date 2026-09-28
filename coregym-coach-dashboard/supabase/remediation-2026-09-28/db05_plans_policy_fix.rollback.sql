-- ============================================================================
-- DB-05 v2 ROLLBACK — restores the EXACT broken live policy (captured
-- verbatim from pg_policies on 2026-09-28): FOR ALL TO public with
-- coach_id = auth.uid() on both USING and WITH CHECK. Run only on a verified
-- regression caused by the fix.
-- ============================================================================

DROP POLICY IF EXISTS "coach_manage_own_plans" ON public.subscription_plans;

CREATE POLICY "coach_manage_own_plans" ON public.subscription_plans
  FOR ALL TO public
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- client_read_subscribed_plans was never touched, so nothing to restore.
-- RLS enablement is left in place (it was enabled before this migration).
