-- ============================================================================
-- coach_profile_policy_migration.sql
-- Coach profile & policy (Settings → Coach profile & Policy).
--
-- Adds ONE nullable column to `coaches` storing the coach's structured
-- training policy, edited from the dashboard Settings page:
--   {
--     "cancellationNoticeDays": 24,      -- integer, hours/days notice
--     "refundPolicy": "...",             -- free text
--     "lateFeeAmount": 10                -- numeric
--   }
--
-- Non-destructive, idempotent. Apply in the Supabase SQL Editor upon
-- approval (or ask the assistant to apply it via the Management API).
-- No RLS changes: the dashboard writes via the service-role profile route,
-- which verifies authentication + coach ownership itself.
-- ============================================================================

alter table public.coaches
  add column if not exists policy jsonb;
