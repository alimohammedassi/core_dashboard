-- ============================================================================
-- DB-01 v2 ROLLBACK — restores the EXACT pre-migration live state documented
-- by the 2026-09-28 introspection:
--   policies: profiles_select_public, profiles_select, coaches_read_all
--     (plus the untouched profiles_insert/profiles_update/coaches_*)
--   grants:   anon table-wide SELECT/INSERT/UPDATE/DELETE/TRUNCATE/
--             REFERENCES/TRIGGER on both tables
-- RLS stays ENABLED (it was enabled before).
-- Run ONLY on a verified regression that the runbook could not resolve.
-- ============================================================================

-- 1) Drop the policies created by the forward migration
DROP POLICY IF EXISTS "profiles_select_own"            ON public.profiles;
DROP POLICY IF EXISTS "profiles_coach_read_subscribed" ON public.profiles;
DROP POLICY IF EXISTS "coaches_public_read_active"     ON public.coaches;

-- 2) Recreate the exact live policies removed by the forward migration
--    (predicates captured verbatim from pg_policies on 2026-09-28).
CREATE POLICY "profiles_select_public" ON public.profiles
  FOR SELECT TO public
  USING (
    (auth.uid() = id) OR (role = 'coach'::user_role) OR (
      EXISTS (
        SELECT 1 FROM public.subscriptions s
        JOIN public.coaches c ON c.id = s.coach_id
        WHERE s.client_id = profiles.id AND c.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO public
  USING (auth.uid() = id);

CREATE POLICY "coaches_read_all" ON public.coaches
  FOR SELECT TO public
  USING (is_active = true);

-- 3) Restore the exact pre-migration anon grants (table-wide, as live)
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.coaches  TO anon;

-- 4) Verify: anon probes return profile/coach rows again (= the insecure
--    pre-state). Then re-plan the lockdown with corrections.
