-- ============================================================================
-- DB-01 (P0) — profiles + coaches anon-read lockdown
-- Remediation run 2026-09-28. NOT APPLIED YET (no live DB access in this run).
--
-- Live evidence: anon-key REST probes (2026-09-28) returned REAL rows from
-- profiles (email, full_name, age, gender, height_cm, weight_kg, fitness_goal,
-- role) and coaches (stripe_account_id, user_id). Committed SQL cannot explain
-- this (no committed policy grants anon SELECT on profiles), so live RLS is
-- disabled or a live-only public policy exists. Live introspection MUST be run
-- first (see runbook at the bottom) and this file adapted if the live schema
-- differs.
--
-- Adapted from the reviewed-but-unapplied WIP file
-- supabase/rls_profiles_coaches_lockdown.sql (prior session), with one
-- deliberate strengthening: this version REMOVES anon access to
-- coaches.stripe_account_id and coaches.user_id via column-level grants
-- (row-level policies alone cannot hide columns).
--
-- Readers preserved:
--   * dashboard user-context reads: own profile; subscribed clients' profiles;
--     own coach row (service-role routes bypass RLS, unaffected)
--   * authenticated marketplace/chat reads: full coaches rows (unchanged)
--   * ANON marketplace discovery: active coach rows, SAFE COLUMNS ONLY
--     (select=* against coaches as anon will now ERROR by design — any anon
--      caller must select the permitted columns explicitly)
--
-- Idempotent: safe to run multiple times.
-- ROLLBACK: db01_profiles_coaches_lockdown.rollback.sql (restores the
-- insecure pre-state — run only on a verified regression).
-- ============================================================================

-- 0) Enable RLS (no-op if already enabled)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches  ENABLE ROW LEVEL SECURITY;

-- 1) profiles — replace any public-readable SELECT policy with least privilege
DROP POLICY IF EXISTS "profiles_select_all"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_all"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_anon_read"   ON public.profiles;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Coach reads subscribed clients (active subscriptions), keyed through
-- coaches.user_id (the live keying — NOT auth.uid(), see DB-05).
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

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- 2) coaches — marketplace read stays, sensitive columns leave anon scope
DROP POLICY IF EXISTS "coaches_public_read_active" ON public.coaches;
CREATE POLICY "coaches_public_read_active" ON public.coaches
  FOR SELECT USING (is_active = true OR user_id = auth.uid());

DROP POLICY IF EXISTS "coaches_update_own" ON public.coaches;
CREATE POLICY "coaches_update_own" ON public.coaches
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Column lockdown: anon loses the table-wide SELECT and gets an explicit
-- safe-column grant. stripe_account_id and user_id are NOT in the list.
-- authenticated/service_role keep their default table-wide grants.
REVOKE SELECT ON public.coaches FROM anon;
GRANT SELECT (
  id, bio, price_monthly, specialization, rating, is_active,
  policy, created_at, updated_at
) ON public.coaches TO anon;

-- ============================================================================
-- RUNBOOK (apply + verify) — execute in order, STOP on any failure:
--   1. Introspect pre-state and save the output:
--        select schemaname, tablename, policyname, permissive, roles, cmd, qual
--        from pg_policies where tablename in ('profiles','coaches');
--        select tablename, rowsecurity from pg_tables
--        where schemaname='public' and tablename in ('profiles','coaches');
--        select grantee, privilege_type, column_name is not null as per_column
--        from information_schema.role_table_grants
--        where table_name='coaches' and grantee in ('anon','authenticated');
--   2. Confirm coaches columns match the GRANT list above
--      (select column_name from information_schema.columns
--       where table_name='coaches' order by ordinal_position;)
--      and add any missing non-sensitive column to the list.
--   3. Apply this file in the Supabase SQL editor.
--   4. Verify anon:  GET /rest/v1/profiles?select=*&limit=1   -> []
--                    GET /rest/v1/coaches?select=*&limit=1    -> 42501/400
--                    (column-level denial — select safe columns instead -> rows
--                     WITHOUT stripe_account_id/user_id)
--   5. Verify authenticated: own profile reads; coach client lists populate;
--      login + onboarding + chat name rendering still work.
--   6. Smoke-test the MOBILE app: marketplace discovery + coach profile view
--      (anon or authenticated, whichever the app uses). If the mobile anon
--      marketplace uses select=* on coaches, update it to the safe columns
--      or re-add the needed column to the anon grant explicitly.
-- ============================================================================
