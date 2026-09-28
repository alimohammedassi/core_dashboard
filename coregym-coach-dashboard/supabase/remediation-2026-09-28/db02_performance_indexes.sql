-- ============================================================================
-- DB-02 v2 (P1) — the SIX indexes confirmed MISSING live (2026-09-28
-- introspection). v1 also listed messages / coaches / daily_summary — those
-- already exist live and are intentionally REMOVED here:
--   messages(conversation_id, created_at DESC)  = idx_messages_conversation_id
--   coaches(user_id) UNIQUE                     = coaches_user_id_key
--   daily_summary(user_id, summary_date)        = daily_summary_user_id_summary_date_key
--                                                 + idx_summary_user_date
-- Referenced columns verified live for every index below.
-- NOT APPLIED. CONCURRENTLY (no blocking locks; run statements individually).
-- ROLLBACK: db02_performance_indexes.rollback.sql
-- ============================================================================

-- 1) workout_sets by session — review page, subscriber profile, progress grid.
--    NOTE: live workout_sets has NO indexes at all (not even a PK) — the
--    largest table in the schema is currently a full-scan heap.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workout_sets_session
  ON public.workout_sets (session_id);

-- 2) overview/revenue/export payments pull (equality + sort)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_intents_coach_status_created
  ON public.payment_intents (coach_id, status, created_at);

-- 3) overview + subscriber page session history (live table has no indexes)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workout_sessions_user_date
  ON public.workout_sessions (user_id, session_date DESC);

-- 4) overview meals-today + subscriber page (live table has no indexes)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nutrition_logs_user_date
  ON public.nutrition_logs (user_id, logged_date DESC);

-- 5) mark-all-read UPDATE scans + unread badge queries (live table has no indexes)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_read
  ON public.notifications (user_id, is_read);

-- 6) serves the live cpe_client_read policy predicate (client_id = auth.uid())
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cpe_client
  ON public.client_program_enrollments (client_id);

-- ============================================================================
-- RUNBOOK:
--   1. Re-check for equivalents immediately before applying (names may have
--      changed since this introspection):
--      select indexname, indexdef from pg_indexes where schemaname='public'
--      and tablename in ('workout_sets','payment_intents','workout_sessions',
--      'nutrition_logs','notifications','client_program_enrollments');
--   2. Apply one statement at a time. A failed CONCURRENTLY leaves an INVALID
--      index — drop and retry: drop index concurrently if exists <name>;
--   3. EXPLAIN (ANALYZE) the hot queries afterwards; expect index scans.
--   4. Follow-up (separate decision, NOT in this migration): workout_sets,
--      messages and notifications have NO primary key — consider adding PKs
--      in a dedicated migration.
-- ============================================================================
