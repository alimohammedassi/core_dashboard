-- personal_records supporting index (Phase: final readiness, item §15)
--
-- The personal_records view scans workout_sets filtered by user_id (the outer
-- user filter is pushed into the view's scan — verified via EXPLAIN ANALYZE).
-- At small volumes Postgres correctly seq-scans; this index lets the planner
-- use an index scan as workout_sets grows across all users.
--
-- Non-destructive, idempotent. Apply in the Supabase SQL Editor upon
-- approval; nothing in the application changes (same view, same shape).

create index if not exists idx_workout_sets_user_weight
  on public.workout_sets (user_id, weight_kg desc);
