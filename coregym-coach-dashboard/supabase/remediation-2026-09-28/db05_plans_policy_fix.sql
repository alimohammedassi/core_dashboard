-- ============================================================================
-- DB-05 (P2) — fix plans_coach_all keying mismatch.
-- NOT APPLIED YET. APPLY ONLY IF live introspection confirms the documented
-- issue: docs/PROJECT_SUMMARY.md (committed at b03161f) states the LIVE
-- policy compares subscription_plans.coach_id = auth.uid(), but live rows key
-- coach_id to coaches.id — so coaches can never SELECT their own plans via
-- the user context. The intended fix text already existed in the unapplied
-- supabase/rls_role_updates.sql:158-164; this file re-states it standalone
-- (rls_role_updates.sql also carries other unrelated changes and must not be
-- applied wholesale).
-- Idempotent. ROLLBACK: db05_plans_policy_fix.rollback.sql
-- ============================================================================

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_coach_all" ON public.subscription_plans;
CREATE POLICY "plans_coach_all" ON public.subscription_plans
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

-- Marketplace/public read of ACTIVE plans (mirrors schema.sql intent so
-- client-side plan browsing keeps working once RLS is genuinely enforced).
DROP POLICY IF EXISTS "plans_read_active" ON public.subscription_plans;
CREATE POLICY "plans_read_active" ON public.subscription_plans
  FOR SELECT USING (is_active = true);

-- ============================================================================
-- RUNBOOK: introspect live policies first:
--   select policyname, roles, cmd, qual, with_check from pg_policies
--   where tablename='subscription_plans';
-- If live already has a correct EXISTS-based plans_coach_all, SKIP this file.
-- Apply, then verify: coach sees own plans on /dashboard/plans (user-session
-- read), anon sees only active plans, service-role writes unaffected.
-- ============================================================================
