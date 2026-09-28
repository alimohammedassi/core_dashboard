import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { checkCooldown } from "@/lib/rate-limit";

export async function POST() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || secret.includes("placeholder")) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY is not configured (placeholder). Add real key to .env.local to enable Connect." },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ST3: one Connect flow per user per minute (link minting + account
  // creation are the abuse-sensitive operations here).
  if (checkCooldown(`stripe-connect:${user.id}`)) {
    return NextResponse.json(
      { error: "Please wait a minute before retrying the Stripe connection" },
      { status: 429 }
    );
  }

  // STR-01: Connect is a coach-only feature. resolveCoachId falls back to the
  // auth uid when no coaches row exists — treat that as "not a coach" so a
  // plain signup can never mint Stripe Express accounts under the platform.
  const coachId = await resolveCoachId(supabase, user.id);
  if (coachId === user.id) {
    return NextResponse.json({ error: "Only coaches can connect Stripe payouts" }, { status: 403 });
  }
  const [{ data: coach }, { data: profile }] = await Promise.all([
    supabase.from("coaches").select("stripe_account_id").eq("id", coachId).single(),
    supabase.from("profiles").select("email").eq("id", user.id).single(),
  ]);
  const existing = (coach as { stripe_account_id?: string } | null)?.stripe_account_id ?? null;

  // Dynamic import so build doesn't fail when key is placeholder
  const { getStripe } = await import("@/lib/stripe/server");
  const stripe = getStripe();

  let accountId = existing;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: (profile as { email?: string } | null)?.email ?? user.email ?? undefined,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    });
    accountId = account.id;
    // STR-04: conditional update — two concurrent first-connects can both pass
    // the cooldown on different serverless instances; only the first write
    // wins and the loser adopts the stored account id instead of leaving an
    // orphaned Express account behind.
    const { data: updated } = await supabase
      .from("coaches")
      .update({ stripe_account_id: accountId })
      .eq("id", coachId)
      .eq("stripe_account_id", null)
      .select("stripe_account_id")
      .single();
    const stored = (updated as { stripe_account_id?: string } | null)?.stripe_account_id ?? null;
    if (stored && stored !== accountId) accountId = stored;
  }

  // CFG-03: no silent localhost fallback — a missing app URL would send
  // Stripe onboarding back to http://localhost:3000 in production.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !appUrl.startsWith("https://")) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is not configured for production" }, { status: 503 });
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/dashboard/settings`,
    return_url: `${appUrl}/dashboard/settings?connected=1`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url, accountId });
}
