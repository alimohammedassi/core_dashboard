import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!secret || secret.includes("placeholder") || !stripeKey || stripeKey.includes("placeholder")) {
    return NextResponse.json({
      received: true,
      mock: true,
      note: "Stripe webhook secret not configured — skipping verification (dev mock).",
    });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await req.text();
  const stripe = new Stripe(stripeKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.id) {
          await supabase.from("payment_intents").update({ status: "succeeded" }).eq("stripe_payment_intent_id", pi.id);
          const subId = (pi.metadata as Record<string, string> | undefined)?.subscription_id;
          if (subId) {
            await supabase.from("subscriptions").update({ status: "active" }).eq("id", subId);
          }
        }
        break;
      }
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        if (acct.id) {
          await supabase.from("profiles").update({ stripe_account_id: acct.id }).eq("stripe_account_id", acct.id);
        }
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
          await supabase.from("subscriptions").update({ status: mapped }).eq("stripe_subscription_id", sub.id);
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

  return NextResponse.json({ received: true });
}

export const dynamic = "force-dynamic";
