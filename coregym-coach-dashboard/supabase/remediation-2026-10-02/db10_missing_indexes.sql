-- ============================================================================
-- DB-10 (2026-10-02) — indexes that are GENUINELY MISSING live.
-- Prepared by the performance-remediation pass; NOT EXECUTED (no DDL was run).
-- Source of truth: docs/live-db-introspection-2026-10-02/indexes.json
-- (full live pg_indexes dump, 138 rows) diffed against
-- supabase/remediation-2026-09-28/db02_performance_indexes.sql (6 proposals).
--
-- DIFF RESULT vs db02 (see remediation log for the full table):
--   db02 #1 workout_sets(session_id)            -> COVERED live by
--          idx_sets_session (same columns, different name). DO NOT duplicate.
--   db02 #3 workout_sessions(user_id, date DESC)-> COVERED live by
--          idx_sessions_user_date (ASC btree scans backward for DESC). SKIP.
--   db02 #4 nutrition_logs(user_id, date DESC)  -> COVERED live by
--          idx_nutrition_user_date. SKIP.
--   db02 #5 notifications(user_id, is_read)     -> COVERED live by the partial
--          notifications_user_unread_idx (user_id, is_read) WHERE is_read =
--          false plus the (user_id, created_at DESC) prefix of
--          notifications_user_list_idx for full-user scans. SKIP.
--   db02 #6 client_program_enrollments(client_id) -> MISSING -> index 2 below.
--   db02 #2 payment_intents(coach_id, status, created_at) -> MISSING -> index 1.
-- Plus: index 3 revives the repo's own supabase/personal_records_index.sql,
-- verified still absent live (workout_sets has only idx_sets_session + pkey).
--
-- Between 2026-09-28 and the 2026-10-02 dump, db02 #1/#3/#4/#5 were applied
-- live under DIFFERENT names (see SKIP notes above); #2 and #6 were NOT and
-- become indexes 1 and 2 below.
-- ============================================================================

-- 1) db02 #2, still missing. Hot readers: /dashboard overview (payments pull:
--    coach_id = ? AND status = 'succeeded' ORDER BY created_at), revenue page
--    rounds 1-2 (range scans + exact head-count), /api/revenue/export.
--    Live payment_intents today: pkey, client_id, stripe_payment_id — every
--    coach-scoped payment read seq-scans.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_intents_coach_status_created
  ON public.payment_intents (coach_id, status, created_at);

-- 2) db02 #6, still missing. Serves the live cpe_client_read RLS policy
--    (client_id = auth.uid()) used by the mobile app; idx_cpe_coach
--    (coach_id, client_id) cannot serve a bare client_id predicate because
--    client_id is its second column.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cpe_client
  ON public.client_program_enrollments (client_id);

-- 3) pre-existing prepared migration (supabase/personal_records_index.sql),
--    verified absent in the 2026-10-02 dump. Serves the personal_records VIEW
--    (user_id filter pushed into the workout_sets scan) that backs the PR
--    section of every subscriber profile render (lib/workouts.ts
--    loadClientProgress) as workout_sets grows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workout_sets_user_weight
  ON public.workout_sets (user_id, weight_kg DESC);

-- ============================================================================
-- RUNBOOK (do NOT run blindly — re-verify immediately before applying):
--   1. Re-check for equivalents (names may have changed since 2026-10-02):
--        select indexname, indexdef from pg_indexes where schemaname='public'
--        and tablename in ('payment_intents','client_program_enrollments',
--        'workout_sets');
--      If an equivalent (same table + same key columns) exists under any
--      name, SKIP that statement — never create a duplicate index.
--   2. Apply one statement at a time; CREATE INDEX CONCURRENTLY cannot run
--      inside a transaction. A failed CONCURRENTLY leaves an INVALID index —
--      drop and retry: drop index concurrently if exists <name>;
--   3. EXPLAIN (ANALYZE) the hot queries afterwards; expect index scans.
--   4. Rollback: db10_missing_indexes.rollback.sql (drops exactly these 3).
-- NOT covered (checked and deliberately omitted):
--   - nutrition_assignments(coach_id, scheduled_date): every dashboard query
--     filters (client_id, scheduled_date) or (enrollment_id, scheduled_date);
--     both are covered live by idx_na_client / idx_na_enrollment. No coach-
--     leading hot query exists, so the index would be dead weight (P-07).
--   - ai_analyses has no indexes, but this dashboard never reads that table
--     (mobile app only) — out of scope here.
-- ============================================================================
