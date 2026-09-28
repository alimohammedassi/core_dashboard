-- ============================================================================
-- AUTH-01 v2 ROLLBACK — restores the EXACT pre-migration live state:
--   user_goals: own-row CRUD (goals_select/insert/update/delete) only — the
--               coach-read policy added by the forward migration is removed
--               (coach goal reads return to fail-closed).
--   foods:      foods_select · SELECT · public · USING (true)  [fully public]
--               foods_insert · INSERT · public ·
--                 WITH CHECK ((auth.uid() = created_by) OR (is_custom = false))
-- Run ONLY on a verified regression.
-- ============================================================================

DROP POLICY IF EXISTS "user_goals_coach_read" ON public.user_goals;
DROP POLICY IF EXISTS "foods_select_catalog"  ON public.foods;
DROP POLICY IF EXISTS "foods_insert_own"      ON public.foods;

CREATE POLICY "foods_select" ON public.foods
  FOR SELECT TO public
  USING (true);

CREATE POLICY "foods_insert" ON public.foods
  FOR INSERT TO public
  WITH CHECK ((auth.uid() = created_by) OR (is_custom = false));
