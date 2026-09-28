-- ============================================================================
-- DB-01 ROLLBACK — restores the INSECURE pre-migration state.
-- Run ONLY if the lockdown caused a verified production regression that the
-- forward migration's own verification steps could not resolve.
-- Requires the pre-state introspection output saved by the runbook (step 1):
-- if policies other than the ones created here existed before, restore them
-- from that snapshot instead of relying on this file's assumptions.
-- ============================================================================

-- 1) Drop the policies created by the forward migration
DROP POLICY IF EXISTS "profiles_select_own"            ON public.profiles;
DROP POLICY IF EXISTS "profiles_coach_read_subscribed" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"            ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"            ON public.profiles;
DROP POLICY IF EXISTS "coaches_public_read_active"     ON public.coaches;
DROP POLICY IF EXISTS "coaches_update_own"             ON public.coaches;

-- 2) Restore anon table-wide SELECT on coaches (pre-state assumption: the
--    default Supabase grant was table-wide; confirm against the snapshot)
GRANT SELECT ON public.coaches TO anon;

-- 3) Disable RLS — ONLY correct if the introspection snapshot showed
--    rowsecurity = false for these tables before the migration. If RLS was
--    already enabled before (with different policies), SKIP this statement
--    and restore those policies from the snapshot instead.
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches  DISABLE ROW LEVEL SECURITY;

-- 4) Verify: anon probe returns rows again (= insecure pre-state restored).
--    Then re-plan the lockdown with the corrected policy set.
