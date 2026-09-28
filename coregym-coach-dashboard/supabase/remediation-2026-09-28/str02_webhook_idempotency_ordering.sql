-- ============================================================================
-- STR-02 (P2) — Stripe webhook idempotency + event ordering.
-- NOT APPLIED YET. Must be applied BEFORE (or together with) the deploy of
-- the webhook route changes from this run: the new route code treats a
-- missing/duplicated-failing events table as a hard 503 instead of silently
-- degrading.
--
-- Design (extends the reviewed WIP sketch — not copied blindly):
--   * stripe_webhook_events: one row per processed Stripe event id
--     (insert-first claim inside the route; PK conflict = duplicate).
--   * event_created_at: Stripe event timestamp, persisted for ordering.
--   * subscriptions.last_stripe_event_at: per-row ordering watermark so a
--     retried OLDER event can never regress subscription status (the
--     "canceled -> active resurrection" scenario from the audit).
-- Additive only; no existing data touched. ROLLBACK: str02_*.rollback.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id         text PRIMARY KEY,
  event_type       text NOT NULL,
  event_created_at timestamptz,
  received_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (webhook route) touches this table, and
-- service_role bypasses RLS. anon/authenticated get no grants by default.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_stripe_event_at timestamptz;

-- Verify: \d public.stripe_webhook_events / \d public.subscriptions
