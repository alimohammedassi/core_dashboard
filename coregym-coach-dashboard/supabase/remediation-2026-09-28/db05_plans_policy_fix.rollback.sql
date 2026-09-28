-- ============================================================================
-- DB-05 ROLLBACK — restores the (broken) pre-migration policy exactly as
-- documented in PROJECT_SUMMARY.md / schema.sql so behavior matches the
-- pre-fix state. Run only on a verified regression.
-- ============================================================================

DROP POLICY IF EXISTS "plans_coach_all" ON public.subscription_plans;
CREATE POLICY "plans_coach_all" ON public.subscription_plans
  FOR ALL TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "plans_read_active" ON public.subscription_plans;

-- NOTE: RLS enablement is intentionally left in place (ENABLE is not
-- reverted): disabling RLS on a live table mid-incident is riskier than
-- leaving it enforced. Manually run the DISABLE statement below only if the
-- pre-state snapshot showed RLS disabled AND the regression demands it:
-- ALTER TABLE public.subscription_plans DISABLE ROW LEVEL SECURITY;
