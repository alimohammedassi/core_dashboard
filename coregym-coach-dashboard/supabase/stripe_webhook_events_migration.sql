-- ============================================================================
-- stripe_webhook_events_migration.sql
-- Replay protection for POST /api/webhooks/stripe (S3 follow-up).
-- Additive: one service-role-only table, no RLS policies for anon/
-- authenticated (the webhook writes via service_role, which bypasses RLS).
-- RLS is still enabled so PostgREST never serves these rows to clients.
-- Idempotent: safe to run multiple times.
-- STOP AND ASK: needs live apply via Supabase SQL Editor before the
-- dedupe check in the webhook route can find this table. Until applied,
-- the route logs a warning and processes the event (fail-open on dedupe
-- only — signature verification still fails closed).
-- ============================================================================

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
