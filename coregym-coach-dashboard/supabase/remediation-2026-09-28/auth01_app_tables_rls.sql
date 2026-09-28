-- ============================================================================
-- AUTH-01 + DB-01b (P1) — RLS for application tables with no committed
-- policy: coach_content, notification_preferences, coach_onboarding,
-- user_goals, daily_summary, foods.
-- Remediation run 2026-09-28. NOT APPLIED YET (no live DB access).
--
-- Live evidence (2026-09-28 anon probes): all five private tables return
-- EMPTY to anon today. That is consistent with EITHER (a) RLS enabled with no
-- policies (fail-closed) or (b) RLS disabled AND zero rows existing. If (b),
-- every future row becomes publicly readable the moment it is written. This
-- migration makes the intended posture explicit and self-healing: enable RLS
-- everywhere and add least-privilege policies. If (a) was already true, these
-- statements are no-ops / additive and nothing changes for existing readers.
--
-- Reader map (from committed app code):
--   coach_content            CredentialsManager (user session)  -> own rows
--   notification_preferences NotificationsPrefs (user session)  -> own rows
--   coach_onboarding         dashboard layout (user session)    -> own row
--   user_goals               overview + subscriber pages, USER session reading
--                            a CLIENT's goals -> own-row + coach-of-subscribed
--   daily_summary            same -> own-row + coach-of-subscribed
--   foods                    foods/search route (user session) + anon catalog
--                            -> public rows unless is_custom and owned
--
-- Column names for user_goals / daily_summary / notification_preferences /
-- coach_content are taken from committed app code and rls_role_updates.sql
-- (user_id, summary_date, is_custom, created_by, coach_id). VERIFY against
-- information_schema.columns before applying; adjust names if the live schema
-- differs. Idempotent. ROLLBACK: auth01_app_tables_rls.rollback.sql
-- ============================================================================

-- ── 0) Enable RLS (no-op if already enabled) ────────────────────────────────
ALTER TABLE public.coach_content            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_onboarding         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_goals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_summary            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foods                    ENABLE ROW LEVEL SECURITY;

-- ── 1) coach_content — coach-private credentials/certificates ───────────────
-- Ownership via coaches.user_id (rows carry the client-supplied coach_id —
-- the WITH CHECK below makes forging another coach's id fail closed at the
-- DB level, independent of the app change in this run).
DROP POLICY IF EXISTS "coach_content_all_own" ON public.coach_content;
CREATE POLICY "coach_content_all_own" ON public.coach_content
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coaches c
      WHERE c.id = coach_content.coach_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.coaches c
      WHERE c.id = coach_content.coach_id
        AND c.user_id = auth.uid()
    )
  );

-- ── 2) notification_preferences — own row ───────────────────────────────────
DROP POLICY IF EXISTS "notification_prefs_all_own" ON public.notification_preferences;
CREATE POLICY "notification_prefs_all_own" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 3) coach_onboarding — own row (layout reads it user-session side) ───────
DROP POLICY IF EXISTS "coach_onboarding_select_own" ON public.coach_onboarding;
CREATE POLICY "coach_onboarding_select_own" ON public.coach_onboarding
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "coach_onboarding_write_own" ON public.coach_onboarding;
CREATE POLICY "coach_onboarding_write_own" ON public.coach_onboarding
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "coach_onboarding_update_own" ON public.coach_onboarding;
CREATE POLICY "coach_onboarding_update_own" ON public.coach_onboarding
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── 4) user_goals — own row + coach-of-active-subscriber read ───────────────
DROP POLICY IF EXISTS "user_goals_select_own" ON public.user_goals;
CREATE POLICY "user_goals_select_own" ON public.user_goals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

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

DROP POLICY IF EXISTS "user_goals_write_own" ON public.user_goals;
CREATE POLICY "user_goals_write_own" ON public.user_goals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_goals_update_own" ON public.user_goals;
CREATE POLICY "user_goals_update_own" ON public.user_goals
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── 5) daily_summary — same shape as user_goals ─────────────────────────────
DROP POLICY IF EXISTS "daily_summary_select_own" ON public.daily_summary;
CREATE POLICY "daily_summary_select_own" ON public.daily_summary
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "daily_summary_coach_read" ON public.daily_summary;
CREATE POLICY "daily_summary_coach_read" ON public.daily_summary
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.coaches c ON c.id = s.coach_id
      WHERE s.client_id = daily_summary.user_id
        AND c.user_id = auth.uid()
        AND s.status = 'active'
    )
  );

DROP POLICY IF EXISTS "daily_summary_write_own" ON public.daily_summary;
CREATE POLICY "daily_summary_write_own" ON public.daily_summary
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "daily_summary_update_own" ON public.daily_summary;
CREATE POLICY "daily_summary_update_own" ON public.daily_summary
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── 6) foods — global catalog public; custom rows owner-only ────────────────
-- (DB-01b) Anonymous catalog browsing keeps working; is_custom rows are
-- visible only to their creator (created_by = auth user id).
DROP POLICY IF EXISTS "foods_select_catalog" ON public.foods;
CREATE POLICY "foods_select_catalog" ON public.foods
  FOR SELECT
  USING (is_custom IS NOT TRUE OR created_by = auth.uid());

-- No INSERT/UPDATE/DELETE policies for anon or authenticated here on purpose:
-- food writes are admin/seed-side (service_role bypasses RLS) and the
-- dashboard has no foods write route (verified by grep in the audit).

-- ============================================================================
-- RUNBOOK: introspect pre-state (pg_policies/pg_tables/role_table_grants for
-- these six tables), confirm column names, apply, then verify:
--   anon:  foods?select=*&limit=1            -> only is_custom=false rows
--          coach_content?select=*&limit=1    -> []
--   user A JWT: cannot select user B's coach_content/notification rows ([])
--   owner JWT: own rows return; coach sees subscribed client's daily_summary
--   mobile smoke test: food search, goal/summary reads, onboarding wizard
-- ============================================================================
