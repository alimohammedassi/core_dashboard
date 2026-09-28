import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

// PostgREST error codes that mean "dedupe infrastructure is not in place".
// STR-02: these now fail VISIBLY (503) instead of silently degrading — a
// missing stripe_webhook_events table after this deploy is a misconfiguration
// that must page someone, not quietly disable replay protection.
const DEDUPE_MISSING_CODES = new Set(["42P01", "PGRST205", "PGRST204"]);

function isMissingTableError(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return !!code && DEDUPE_MISSING_CODES.has(code);
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!secret || secret.includes("placeholder") || !stripeKey || stripeKey.includes("placeholder")) {
    // Fail CLOSED (LV2): never acknowledge a webhook we cannot verify.
    // Returning 2xx here would silently drop real payment events and mask
    // misconfiguration as success. Stripe will retry on non-2xx.
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await req.text();
  const stripe = new Stripe(stripeKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch {
    // S10: Stripe's verification error text stays server-side.
    console.error("[stripe-webhook] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // STR-02: event timestamp, used as the ordering watermark below.
  const eventTs = new Date((event.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();

  // Replay protection pre-check: skip events already recorded as processed.
  // A missing table is now a hard 503 (fail-visible) instead of "log and
  // continue"; other infra errors are 500 so Stripe retries.
  const { data: seen, error: seenErr } = await supabase
    .from("stripe_webhook_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (seenErr) {
    console.error("[stripe-webhook] dedupe check failed", seenErr);
    if (isMissingTableError(seenErr)) {
      return NextResponse.json({ error: "Webhook dedupe table missing — apply str02 migration" }, { status: 503 });
    }
    return NextResponse.json({ error: "Webhook dedupe check failed" }, { status: 500 });
  }
  if (seen) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.id) {
          await supabase.from("payment_intents").update({ status: "succeeded" }).eq("stripe_payment_id", pi.id);
          const subId = (pi.metadata as Record<string, string> | undefined)?.subscription_id;
          if (subId) {
            // STR-03 ordering guard, part 1: a (retried) payment event must
            // never resurrect a subscription that a newer lifecycle event
            // already canceled/paused, and never regress the watermark.
            const { data: sub } = await supabase
              .from("subscriptions")
              .select("id, status, last_stripe_event_at")
              .eq("id", subId)
              .maybeSingle();
            const row = sub as { id: string; status: string; last_stripe_event_at: string | null } | null;
            if (row && row.last_stripe_event_at && row.last_stripe_event_at > eventTs) {
              break; // stale event; the newer state already won
            }
            if (row && (row.status === "canceled" || row.status === "paused" || row.status === "expired")) {
              break; // do not resurrect terminal/paused states from a payment
            }
            if (row) {
              await supabase
                .from("subscriptions")
                .update({ status: "active", last_stripe_event_at: eventTs })
                .eq("id", subId)
                .or(`last_stripe_event_at.is.null,last_stripe_event_at.lte.${eventTs}`);
            }
          }
        }
        break;
      }
      case "account.updated": {
        // profiles has no charges_enabled/payouts_enabled columns to persist yet.
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const statusMap: Record<string, string> = {
          active: "active",
          canceled: "canceled",
          past_due: "past_due",
          trialing: "trialing",
          incomplete: "incomplete",
          paused: "paused",
        };
        const mapped = statusMap[sub.status];
        // STR-02: unknown Stripe statuses are acknowledged WITHOUT writing —
        // pushing a value the live enum rejects would 500 and burn the whole
        // 3-day retry schedule on a permanently unmappable event.
        if (!mapped) {
          console.error(`[stripe-webhook] unmapped subscription status "${sub.status}" — acknowledged, not applied`);
          break;
        }
        if (sub.id) {
          // STR-03 ordering guard, part 2: only apply when newer than the
          // stored watermark (NULL = never seen an event).
          await supabase
            .from("subscriptions")
            .update({ status: mapped, last_stripe_event_at: eventTs })
            .eq("stripe_sub_id", sub.id)
            .or(`last_stripe_event_at.is.null,last_stripe_event_at.lte.${eventTs}`);
        }
        break;
      }
      default:
        break;
    }
  } catch (e: unknown) {
    console.error("Webhook handler error", e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  // Record after successful processing so a crash mid-handler is retried.
  // A unique violation means a concurrent delivery processed the same event
  // first — success, not an error. Any OTHER failure is 500 (Stripe retries)
  // so a broken dedupe table is visible instead of silently skipped.
  const { error: recErr } = await supabase
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, event_type: event.type, event_created_at: eventTs });
  if (recErr) {
    const code = (recErr as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[stripe-webhook] dedupe record failed", recErr);
    return NextResponse.json({ error: "Webhook dedupe record failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const dynamic = "force-dynamic";
