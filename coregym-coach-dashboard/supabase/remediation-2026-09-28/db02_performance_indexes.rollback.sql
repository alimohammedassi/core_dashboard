-- ============================================================================
-- DB-02 v2 ROLLBACK — drops the six indexes created by the forward migration.
-- (CONCURRENTLY drops avoid blocking locks.)
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS public.idx_workout_sets_session;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_payment_intents_coach_status_created;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_workout_sessions_user_date;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_nutrition_logs_user_date;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_notifications_user_read;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_cpe_client;
