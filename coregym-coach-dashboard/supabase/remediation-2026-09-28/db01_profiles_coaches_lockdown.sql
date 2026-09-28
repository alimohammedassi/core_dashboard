-- ============================================================================
-- DB-01 v2 (P0) — profiles + coaches anon-read lockdown
-- Remediation 2026-09-28, reconciled against LIVE introspection (same day,
-- Management API SELECT-only): RLS is already ENABLED on both tables; the
-- anonymous PII/health-data leak is caused by two permissive public policies:
--
--   profiles_select_public · SELECT · TO public
--       USING ((auth.uid() = id) OR (role = 'coach') OR (EXISTS (...)))
--       -> the bare `role = 'coach'` term makes EVERY coach profile row
--          (email, full_name, age, gender, height_cm, weight_kg,
--          fitness_goal) readable by the anonymous key.
--   coaches_read_all · SELECT · TO public · USING (is_active = true)
--       -> every active coach's FULL row, including stripe_account_id and
--          user_id.
--
-- Live policy inventory (verified): profiles_select_public, profiles_select,
-- profiles_insert, profiles_update | coaches_read_all, coaches_select_own,
-- coaches_update_own, coaches_insert_own.
-- Live coaches columns (verified): id, user_id, bio, price_monthly,
--   specialization, rating, is_active, stripe_account_id, created_at,
--   updated_at, policy.
-- Live grants: anon AND authenticated both hold table-wide
--   SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER.
--
-- v2 changes vs v1: drops the REAL live policy names (v1 dropped names that
-- do not exist), tightens anon table privileges (INSERT/UPDATE/DELETE/
-- TRUNCATE — TRUNCATE bypasses RLS entirely), and keeps the anon
-- marketplace column-grant design (verified against the live column list).
--
-- Preserved legitimate access:
--   * every authenticated user: own profile (read/insert/update)
--   * coaches: their subscribed clients' profiles (active subscriptions)
--   * coaches: full own coaches row (read/update)
--   * ANON marketplace discovery: ACTIVE coach rows, safe columns only
--     (id, bio, price_monthly, specialization, rating, is_active, policy,
--      created_at, updated_at — NOT user_id, NOT stripe_account_id)
--   * service-role routes: bypass RLS, unaffected
--
-- Idempotent. NOT APPLIED. Rollback: db01_profiles_coaches_lockdown.rollback.sql
-- restores the exact pre-migration policies + grants documented above.
-- ============================================================================

-- ── 0) RLS is already enabled live; statements kept as idempotent no-ops ────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches  ENABLE ROW LEVEL SECURITY;

-- ── 1) profiles — remove the leaking permissive SELECT policies ─────────────
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select"        ON public.profiles;

-- Own row (authenticated). Replaces the dropped live own-row policy.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Coach reads subscribed clients' profiles (active subscriptions only) —
-- covers dashboard client lists, revenue name mapping, chat name rendering.
-- Keyed through coaches.user_id per the live schema (NOT auth.uid()).
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

-- Live profiles_insert (public, wc id = auth.uid()) and profiles_update
-- (authenticated, own) are CORRECT as-is and are intentionally NOT recreated.

-- ── 2) coaches — replace the leaking full-row public read ───────────────────
DROP POLICY IF EXISTS "coaches_read_all" ON public.coaches;

-- Marketplace discovery stays possible: active coach rows (or own row), with
-- column visibility handled by the grants below (row policies cannot hide
-- columns).
DROP POLICY IF EXISTS "coaches_public_read_active" ON public.coaches;
CREATE POLICY "coaches_public_read_active" ON public.coaches
  FOR SELECT USING (is_active = true OR user_id = auth.uid());

-- Live coaches_select_own / coaches_update_own / coaches_insert_own are
-- correct as-is and are intentionally NOT recreated.

-- ── 3) Anonymous privilege tightening ────────────────────────────────────────
-- profiles: SELECT stays table-wide (the policies above now yield ZERO rows
-- for anon; the probe result changes from "rows" to "empty array").
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon;

-- coaches: anon loses the table-wide grant entirely and gets an explicit
-- safe-column SELECT. stripe_account_id and user_id are NOT in the list.
-- authenticated/service_role keep their default table-wide grants (untouched).
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.coaches FROM anon;
GRANT SELECT (
  id, bio, price_monthly, specialization, rating, is_active,
  policy, created_at, updated_at
) ON public.coaches TO anon;

-- ============================================================================
-- RUNBOOK (apply + verify) — execute in order, STOP on any failure:
--   1. Save pre-state introspection (pg_policies / pg_tables / role_table_grants
--      for both tables) — the rollback assumes the exact state documented here.
--   2. Apply this file in the Supabase SQL editor.
--   3. Verify anon probes:
--        GET /rest/v1/profiles?select=*&limit=1        -> 200 with []
--        GET /rest/v1/coaches?select=*&limit=1         -> permission error (42501)
--        GET /rest/v1/coaches?select=id,bio,is_active&limit=1
--                                                      -> 200 rows WITHOUT
--                                                         stripe_account_id/user_id
--   4. Verify authenticated: own profile reads; coach client lists populate;
--      login + onboarding + chat name rendering still work.
--   5. MOBILE smoke test (mandatory): marketplace discovery and coach profile
--      view. If the current mobile app queries coaches with select=* as anon,
--      it must switch to the safe columns (documented mobile-side change —
--      do NOT re-widen the grant to avoid it).
-- ============================================================================
