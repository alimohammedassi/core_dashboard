-- ============================================================================
-- STR-02 ROLLBACK — removes the webhook idempotency artifacts. After this runs
-- the webhook route will hard-fail (503) on every delivery until the forward
-- migration is re-applied — that is the intended fail-visible behavior.
-- ============================================================================

DROP TABLE IF EXISTS public.stripe_webhook_events;

ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS last_stripe_event_at;
