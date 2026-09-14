import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";

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

  // stripe_account_id lives on the coaches row (canonical), not profiles.
  const coachId = await resolveCoachId(supabase, user.id);
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
    await supabase.from("coaches").update({ stripe_account_id: accountId }).eq("id", coachId);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/dashboard/settings`,
    return_url: `${appUrl}/dashboard/settings?connected=1`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url, accountId });
}
