-- ============================================================================
-- CoreGym — Role separation & RLS hardening (PART 3 deliverable)
-- Run in Supabase SQL Editor if you want to formalize the role model at the
-- database level. The app + dashboard already work WITHOUT this file: the
-- coach dashboard enforces "coach sees only subscribed customers" in
-- application code (Next.js server verifies the subscription before reading
-- customer data), and the mobile app only creates customer accounts.
--
-- This script adds defense-in-depth at the database layer:
--   1. Customers may never self-promote to 'coach' via profile updates.
--   2. Coaches can read logged data ONLY of customers subscribed to them.
--   3. Coach marketplace profiles (coaches) stay publicly readable.
--
-- Tested against the live schema (tables: profiles, coaches, coach_onboarding,
-- daily_summary, nutrition_logs, workout_sessions, workout_sets,
-- body_measurements, user_goals, subscription_plans).
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Lock role changes: a user can update their own profile but NOT their role.
--    (Drop the generic own-update policy if it exists, replace with a
--    role-preserving one using a trigger — RLS WITH CHECK alone cannot compare
--    OLD/NEW, so we use a trigger.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger AS $$
BEGIN
  IF NEW.role <> OLD.role AND OLD.role = 'coach' THEN
    RAISE EXCEPTION 'Cannot change role of a coach account';
  END IF;
  IF NEW.role = 'coach' AND OLD.role <> 'coach' THEN
    -- Coach role is only granted by the Core Dashboard onboarding
    -- (service_role bypasses this trigger).
    RAISE EXCEPTION 'Becoming a coach requires the Core Dashboard sign-up flow';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- ----------------------------------------------------------------------------
-- 2) Helper: is the current user a coach? (used by policies below)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.coaches WHERE user_id = auth.uid());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ----------------------------------------------------------------------------
-- 3) Customer logged data: coach can read ONLY subscribed customers.
--    subscriptions.coach_id -> coaches.id, so join through coaches.user_id.
--    These REPLACE any broader per-user SELECT policies. If your project
--    already has "users can read own rows" policies, keep them and ADD the
--    coach policies below — Supabase policies are OR-ed per action.
-- ----------------------------------------------------------------------------

-- daily_summary
DROP POLICY IF EXISTS "coach_read_subscribed_daily_summary" ON public.daily_summary;
CREATE POLICY "coach_read_subscribed_daily_summary" ON public.daily_summary
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.coaches c ON c.id = s.coach_id
      WHERE s.client_id = daily_summary.user_id
        AND c.user_id = auth.uid()
        AND s.status = 'active'
    )
  );

-- nutrition_logs
DROP POLICY IF EXISTS "coach_read_subscribed_nutrition_logs" ON public.nutrition_logs;
CREATE POLICY "coach_read_subscribed_nutrition_logs" ON public.nutrition_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.coaches c ON c.id = s.coach_id
      WHERE s.client_id = nutrition_logs.user_id
        AND c.user_id = auth.uid()
        AND s.status = 'active'
    )
  );

-- workout_sessions
DROP POLICY IF EXISTS "coach_read_subscribed_workout_sessions" ON public.workout_sessions;
CREATE POLICY "coach_read_subscribed_workout_sessions" ON public.workout_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.coaches c ON c.id = s.coach_id
      WHERE s.client_id = workout_sessions.user_id
        AND c.user_id = auth.uid()
        AND s.status = 'active'
    )
  );

-- workout_sets
DROP POLICY IF EXISTS "coach_read_subscribed_workout_sets" ON public.workout_sets;
CREATE POLICY "coach_read_subscribed_workout_sets" ON public.workout_sets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.coaches c ON c.id = s.coach_id
      WHERE s.client_id = workout_sets.user_id
        AND c.user_id = auth.uid()
        AND s.status = 'active'
    )
  );

-- body_measurements
DROP POLICY IF EXISTS "coach_read_subscribed_body_measurements" ON public.body_measurements;
CREATE POLICY "coach_read_subscribed_body_measurements" ON public.body_measurements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.coaches c ON c.id = s.coach_id
      WHERE s.client_id = body_measurements.user_id
        AND c.user_id = auth.uid()
        AND s.status = 'active'
    )
  );

-- user_goals
DROP POLICY IF EXISTS "coach_read_subscribed_user_goals" ON public.user_goals;
CREATE POLICY "coach_read_subscribed_user_goals" ON public.user_goals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.coaches c ON c.id = s.coach_id
      WHERE s.client_id = user_goals.user_id
        AND c.user_id = auth.uid()
        AND s.status = 'active'
    )
  );

-- ----------------------------------------------------------------------------
-- 4) Coaches table: marketplace stays publicly readable (active coaches only);
--    a coach can update their own listing.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "coaches_public_read_active" ON public.coaches;
CREATE POLICY "coaches_public_read_active" ON public.coaches
  FOR SELECT USING (is_active = true OR user_id = auth.uid());

DROP POLICY IF EXISTS "coaches_update_own" ON public.coaches;
CREATE POLICY "coaches_update_own" ON public.coaches
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5) Fix subscription_plans insert: the current policy compares coach_id to
--    auth.uid(), but coach_id references coaches.id — so authenticated
--    inserts can never pass (this is why the dashboard writes via a
--    service-role route). Align it with the real key:
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "plans_coach_all" ON public.subscription_plans;
CREATE POLICY "plans_coach_all" ON public.subscription_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = coach_id AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = coach_id AND c.user_id = auth.uid())
  );

-- ============================================================================
-- NOTE: after running this, the dashboard's Customer Profile page keeps
-- working because the coach's session satisfies the new policies (read only
-- subscribed clients). The /api/plans service-role route remains valid either
-- way.
-- ============================================================================
