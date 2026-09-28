-- ============================================================================
-- CoreGym — LV1 lockdown: profiles + coaches anonymous read exposure
-- Live verification (2026-09-27) proved the anon key can SELECT full rows
-- from public.profiles (email, names, age, gender, weight, role) and
-- public.coaches (stripe_account_id, user_id, policy). Either RLS is not
-- enabled on these tables or a public SELECT policy exists.
--
-- This migration enforces least privilege WITHOUT breaking known readers:
--   * Dashboard (user-context reads): own profile; subscribed clients'
--     profiles (client lists, revenue names, chat names); own coach row.
--   * Service-role routes: bypass RLS, unaffected.
--   * Mobile marketplace: coaches rows stay publicly readable when active
--     (pre-existing intent, see rls_role_updates.sql §4). NOTE this keeps
--     coaches.stripe_account_id visible to anon — accepted residual risk,
--     documented below; Postgres RLS cannot do column-level SELECT.
--
-- OPEN QUESTION (do not expand scope without product confirmation):
--   Mobile marketplace / chat may read a COACH's profiles row (name/avatar)
--   before any subscription exists. The optional policy at the bottom covers
--   that case but re-exposes coach emails to any authenticated user; it is
--   included COMMENTED OUT. Verify mobile reads before enabling.
--
-- STOP AND ASK: applying this to production changes live RLS. Verify against
-- a staging copy first, especially the mobile app's marketplace + chat reads.
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Ensure RLS is enabled (no-op if already enabled).
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 1) profiles: drop any public/anon-readable SELECT policy, replace with
--    least-privilege set. (DROP ... IF EXISTS never fails when absent.)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;

-- 1a) Own row: every authenticated user reads their own profile.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 1b) Coach reads subscribed clients (active subscriptions only).
--     Covers dashboard client lists, revenue name mapping, chat names.
DROP POLICY IF EXISTS "profiles_coach_read_subscribed" ON public.profiles;
CREATE POLICY "profiles_coach_read_subscribed" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.coaches c ON c.id = s.coach_id
      WHERE s.client_id = profiles.id
        AND c.user_id = auth.uid()
        AND s.status = 'active'
    )
  );

-- 1c) Own-row writes preserved (role changes still gated by the
--     trg_prevent_role_escalation trigger from rls_role_updates.sql).
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2) coaches: keep marketplace public-read (active only), owner update.
--    Re-states rls_role_updates.sql §4 so this file is self-sufficient if
--    that migration was never applied (live verification found is_coach()
--    absent, so treat rls_role_updates.sql as unapplied).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "coaches_public_read_active" ON public.coaches;
CREATE POLICY "coaches_public_read_active" ON public.coaches
  FOR SELECT USING (is_active = true OR user_id = auth.uid());

DROP POLICY IF EXISTS "coaches_update_own" ON public.coaches;
CREATE POLICY "coaches_update_own" ON public.coaches
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3) OPTIONAL, COMMENTED OUT — marketplace coach-profile reads.
--    Enable ONLY after confirming the mobile app reads coaches' profiles
--    rows (name/avatar) pre-subscription. Exposes coach emails to any
--    authenticated user; prefer a limited-column public view instead.
-- ----------------------------------------------------------------------------
-- DROP POLICY IF EXISTS "profiles_coach_marketplace_read" ON public.profiles;
-- CREATE POLICY "profiles_coach_marketplace_read" ON public.profiles
--   FOR SELECT TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.coaches c
--       WHERE c.user_id = profiles.id AND c.is_active = true
--     )
--   );

-- ============================================================================
-- RESIDUAL RISK (accepted, documented): coaches.stripe_account_id remains
-- readable wherever coaches rows are publicly readable (marketplace need).
-- Stripe account IDs (acct_*) are identifiers, not secrets, and are required
-- by Connect flows; the platform secret keys are never stored in the DB.
-- Revisit via a limited-column public view if product wants it hidden.
-- ============================================================================
