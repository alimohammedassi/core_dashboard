-- ============================================================================
-- DB-02 (P1) — high-value missing indexes. NOT APPLIED YET.
--
-- RULES FOLLOWED (per audit): live pg_indexes MUST be introspected first;
-- IF NOT EXISTS guards duplicates but cannot detect an EQUIVALENT index with
-- a different name — the runbook includes a catalog query to check each one.
-- CONCURRENTLY is used so builds do not take blocking locks (each statement
-- must run outside a transaction — the Supabase SQL editor executes
-- statements individually, which is fine).
--
-- Column names for daily_summary / nutrition_logs / notifications /
-- workout_sessions are taken from committed app code and rls_role_updates.sql
-- — verify against information_schema.columns before applying.
-- ROLLBACK: db02_performance_indexes.rollback.sql
-- ============================================================================

-- 1) workout_sets by session — 3 hot paths (review page, subscriber profile,
--    progress grid). Largest table in the schema; no committed index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workout_sets_session
  ON public.workout_sets (session_id);

-- 2) chat threads: keyset pagination + last-message embeds (equality + sort)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at DESC);

-- 3) overview/revenue/export payments pull (equality + sort)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_intents_coach_status_created
  ON public.payment_intents (coach_id, status, created_at);

-- 4) overview daily windows + get_user_activity RPC (also serves the
--    coach-read RLS policy predicate on user_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_summary_user_date
  ON public.daily_summary (user_id, summary_date DESC);

-- 5) overview + subscriber page session history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workout_sessions_user_date
  ON public.workout_sessions (user_id, session_date DESC);

-- 6) overview meals-today + subscriber page
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nutrition_logs_user_date
  ON public.nutrition_logs (user_id, logged_date DESC);

-- 7) hottest lookup in the app (every request). UNIQUE if data allows — run
--    the duplicate check first: select user_id, count(*) from coaches
--    group by user_id having count(*) > 1;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_coaches_user_id
  ON public.coaches (user_id);

-- 8) serves the cpe_client_read RLS policy predicate (client_id = auth.uid())
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cpe_client
  ON public.client_program_enrollments (client_id);

-- 9) mark-all-read UPDATE scans + unread badge queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_read
  ON public.notifications (user_id, is_read);

-- ============================================================================
-- RUNBOOK:
--   1. Check for equivalent existing indexes (adjust per candidate):
--      select indexname, indexdef from pg_indexes
--      where schemaname='public' and (
--        indexdef ilike '%workout_sets%' or indexdef ilike '%messages%'
--        or indexdef ilike '%payment_intents%' or indexdef ilike '%daily_summary%'
--        or indexdef ilike '%workout_sessions%' or indexdef ilike '%nutrition_logs%'
--        or indexdef ilike '%coaches%' or indexdef ilike '%client_program_enrollments%'
--        or indexdef ilike '%notifications%');
--   2. Confirm column names exist for tables 4/5/6/9 (information_schema.columns).
--   3. Apply statements one at a time; a failed CONCURRENTLY leaves an INVALID
--      index — drop and retry: drop index concurrently if exists <name>;
--   4. EXPLAIN (ANALYZE) the hot queries afterwards; expect index scans.
-- ============================================================================
