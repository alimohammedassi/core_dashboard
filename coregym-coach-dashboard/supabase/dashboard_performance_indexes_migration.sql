-- ============================================================================
-- dashboard_performance_indexes_migration.sql (DB3)
-- Composite indexes for the dashboard's hottest predicates/joins.
-- Purely additive; safe to run multiple times (IF NOT EXISTS).
-- STOP AND ASK: needs live apply via Supabase SQL Editor. CREATE INDEX
-- takes a brief write lock per table — run off-peak. Verify with
-- EXPLAIN on the revenue fallback + chat list queries afterwards.
-- ============================================================================

create index if not exists idx_subscriptions_coach_status
  on public.subscriptions (coach_id, status);

create index if not exists idx_conversations_coach_lastmsg
  on public.conversations (coach_id, last_message_at desc);

create index if not exists idx_workout_assignments_coach_client
  on public.workout_assignments (coach_id, client_id);

create index if not exists idx_nutrition_assignments_enrollment_date
  on public.nutrition_assignments (enrollment_id, scheduled_date);
