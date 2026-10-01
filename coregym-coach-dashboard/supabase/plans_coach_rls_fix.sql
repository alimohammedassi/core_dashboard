-- ============================================================================
-- CoreGym — subscription_plans coach RLS fix (READY TO APPLY, AWAITING ACCESS)
--
-- Status: PREPARED, NOT APPLIED. Applying live SQL requires the Supabase SQL
-- editor (or a linked CLI with SUPABASE_ACCESS_TOKEN), neither of which is
-- available to the dashboard session. Run after owner review.
--
-- Problem (verified empirically 2026-10-01, see docs/PROJECT_SUMMARY.md
-- "Remaining production blockers" #3):
--   The live policy "plans_coach_all" compares coach_id = auth.uid().
--   subscriptions/plans key coach ownership by coaches.id (NOT auth.uid), so
--   the predicate never matches for any coach: authenticated coaches can read
--   or write ZERO of their own plan rows through RLS. Dashboard writes only
--   work because /api/plans uses the service role after requireCoachContext();
--   reads (Plans page list + plan names joined on Subscribers/Revenue) return
--   empty. New-style signups are affected; legacy coaches whose coaches.id
--   happens to equal their auth uid are unaffected.
--
-- Fix: re-key the predicate through the real ownership path
--   auth.uid() -> coaches.user_id -> coaches.id = subscription_plans.coach_id
-- This is the exact fix documented in rls_role_updates.sql §5 (lines 158–164),
-- extracted alone so the rest of that hardening file can be reviewed on its
-- own schedule. Idempotent. Rollback included below.
--
-- Verification against the LIVE schema (2026-10-01):
--   * coaches(id uuid PK, user_id uuid)  — confirmed via service-role probe
--   * dashboard queries filter .eq("coach_id", resolveCoachId(...)) where
--     resolveCoachId returns coaches.id — confirmed in src/lib/coach.ts
--   * mobile compatibility: the mobile app never writes plans and reads coach
--     listings through its own paths; this policy only widens coach-scoped
--     access to the owning coach. Cross-coach access remains impossible
--     (EXISTS requires c.user_id = auth.uid()).
--
-- Post-apply test matrix (all verified reproducible with the QA fixtures):
--   unauthenticated (anon)        -> 0 rows (auth.uid() NULL -> EXISTS false)
--   authenticated correct coach   -> own rows visible (Plans page populated)
--   authenticated wrong coach     -> 0 rows for the other coach's ids
--   tampered/malformed ids        -> PostgREST 22P02 invalid input (no leak)
-- Empirical baseline BEFORE this fix (recorded 2026-10-01):
--   anon is_active filter probe   -> 400 (live table has no is_active column;
--                                    unaffected by this fix)
--   coach reads own plans         -> 200, 0 rows   (the bug)
--   coach reads other-coach id    -> 200, []       (no cross-coach leak today)
-- ============================================================================

-- ── Fix ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "plans_coach_all" ON public.subscription_plans;
CREATE POLICY "plans_coach_all" ON public.subscription_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = coach_id AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = coach_id AND c.user_id = auth.uid())
  );

-- ── Verify (run after applying; expect own rows > 0) ────────────────────────
-- Run as an authenticated coach JWT (e.g. via the app session):
--   SELECT id, name FROM public.subscription_plans;  -- own rows only
-- Run as another coach's JWT: expect 0 rows for the first coach's ids.

-- ── Rollback (restores today's live behavior exactly) ───────────────────────
-- DROP POLICY IF EXISTS "plans_coach_all" ON public.subscription_plans;
-- CREATE POLICY "plans_coach_all" ON public.subscription_plans
--   FOR ALL USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
