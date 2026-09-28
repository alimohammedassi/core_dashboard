import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

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

  // S3 replay protection: skip events already processed (Stripe retries
  // deliveries; out-of-order subscription events must not regress status).
  // If the stripe_webhook_events table is not migrated yet, log and continue
  // (dedupe degrades, signature verification does not).
  try {
    const { data: seen } = await supabase
      .from("stripe_webhook_events")
      .select("event_id")
      .eq("event_id", event.id)
      .maybeSingle();
    if (seen) return NextResponse.json({ received: true, duplicate: true });
  } catch (e: unknown) {
    console.error("[stripe-webhook] dedupe check failed (table may be unmigrated)", e);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.id) {
          await supabase.from("payment_intents").update({ status: "succeeded" }).eq("stripe_payment_id", pi.id);
          const subId = (pi.metadata as Record<string, string> | undefined)?.subscription_id;
          if (subId) {
            await supabase.from("subscriptions").update({ status: "active" }).eq("id", subId);
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
        const mapped = statusMap[sub.status] ?? sub.status;
        if (sub.id) {
          await supabase.from("subscriptions").update({ status: mapped }).eq("stripe_sub_id", sub.id);
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
  try {
    await supabase
      .from("stripe_webhook_events")
      .insert({ event_id: event.id, event_type: event.type });
  } catch (e: unknown) {
    // Unique-violation race (concurrent redelivery) or unmigrated table:
    // the event was already processed, so this is safe to swallow.
    console.error("[stripe-webhook] dedupe record failed", e);
  }

  return NextResponse.json({ received: true });
}

export const dynamic = "force-dynamic";
