-- ============================================================================
-- DB-02 ROLLBACK — drops the indexes created by the forward migration.
-- (CONCURRENTLY drops also avoid blocking locks.)
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS public.idx_workout_sets_session;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_messages_conversation_created;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_payment_intents_coach_status_created;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_daily_summary_user_date;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_workout_sessions_user_date;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_nutrition_logs_user_date;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_coaches_user_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_cpe_client;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_notifications_user_read;
