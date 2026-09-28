-- ============================================================================
-- AUTH-01 ROLLBACK — drops the policies created by auth01_app_tables_rls.sql
-- and (conditionally) restores the pre-migration posture.
-- Run ONLY on a verified regression. Compare against the pre-apply
-- pg_policies/pg_tables snapshot: if RLS was already ENABLED before this
-- migration (case (a) in the forward file's header), KEEP RLS enabled and
-- only drop the policies added here; if it was DISABLED (case (b)), the
-- rollback below intentionally restores the insecure posture.
-- ============================================================================

DROP POLICY IF EXISTS "coach_content_all_own"           ON public.coach_content;
DROP POLICY IF EXISTS "notification_prefs_all_own"      ON public.notification_preferences;
DROP POLICY IF EXISTS "coach_onboarding_select_own"     ON public.coach_onboarding;
DROP POLICY IF EXISTS "coach_onboarding_write_own"      ON public.coach_onboarding;
DROP POLICY IF EXISTS "coach_onboarding_update_own"     ON public.coach_onboarding;
DROP POLICY IF EXISTS "user_goals_select_own"           ON public.user_goals;
DROP POLICY IF EXISTS "user_goals_coach_read"           ON public.user_goals;
DROP POLICY IF EXISTS "user_goals_write_own"            ON public.user_goals;
DROP POLICY IF EXISTS "user_goals_update_own"           ON public.user_goals;
DROP POLICY IF EXISTS "daily_summary_select_own"        ON public.daily_summary;
DROP POLICY IF EXISTS "daily_summary_coach_read"        ON public.daily_summary;
DROP POLICY IF EXISTS "daily_summary_write_own"         ON public.daily_summary;
DROP POLICY IF EXISTS "daily_summary_update_own"        ON public.daily_summary;
DROP POLICY IF EXISTS "foods_select_catalog"            ON public.foods;

-- Only for case (b) — RLS was disabled before. Remove these two lines' worth
-- of statements for tables the snapshot showed as already RLS-enabled.
ALTER TABLE public.coach_content            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_onboarding         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_goals               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_summary            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.foods                    DISABLE ROW LEVEL SECURITY;
