-- ============================================================================
-- DB-10 rollback — drops exactly the three indexes created by
-- db10_missing_indexes.sql. Safe to run when unsure (IF EXISTS).
-- ============================================================================
DROP INDEX CONCURRENTLY IF EXISTS idx_payment_intents_coach_status_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_cpe_client;
DROP INDEX CONCURRENTLY IF EXISTS idx_workout_sets_user_weight;
