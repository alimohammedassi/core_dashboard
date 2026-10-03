import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/api-error";
import { checkCooldown } from "@/lib/rate-limit";

// Coach onboarding after website sign-up. Creates the coach's rows in the
// SHARED database so the mobile app's "Find a Coach" screen sees them:
//   profiles.role = 'coach'
//   coaches          (subscriptions/plans reference this id)
//   coach_onboarding (the marketplace listing the app reads, is_completed = true)
// Writes use the service role because these tables span rows the new user
// cannot insert directly under the app's RLS. The caller is authenticated
// server-side and may only onboard THEMSELVES.

type CoachPayload = {
  display_name?: string;
  bio?: string;
  price_monthly?: number;
  specialization?: string[];
  years_experience?: number;
  /** false = onboarding in progress (coach_onboarding.is_completed stays false) */
  complete?: boolean;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // API-05: onboarding writes span profiles/coaches/coach_onboarding under
  // service role — one attempt per user per minute (per instance) blunts
  // repeated role/onboarding abuse while leaving the normal flow untouched.
  if (checkCooldown(`coaches-post:${user.id}`, 60_000)) {
    return NextResponse.json({ error: "Too many attempts — please wait a moment" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as CoachPayload;
  const displayName = (String(body.display_name ?? "").trim() || user.email || "Coach").slice(0, 80);
  const bio = String(body.bio ?? "").trim().slice(0, 1000) || null;
  const priceMonthly = Number(body.price_monthly ?? 0);
  if (!Number.isFinite(priceMonthly) || priceMonthly < 0 || priceMonthly > 100000) {
    return NextResponse.json({ error: "price_monthly must be between 0 and 100000" }, { status: 400 });
  }
  const specialization = Array.isArray(body.specialization)
    ? body.specialization.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
    : [];
  const yearsRaw = body.years_experience === undefined ? null : Number(body.years_experience);
  if (yearsRaw !== null && (!Number.isFinite(yearsRaw) || yearsRaw < 0 || yearsRaw > 60)) {
    return NextResponse.json({ error: "years_experience must be between 0 and 60" }, { status: 400 });
  }
  const yearsExperience = yearsRaw;

  const svc = await createServiceClient();

  // S2 eligibility (server-side, independent of the DB trigger): an account
  // holding ACTIVE client subscriptions may not mint a coach identity while
  // embedded in another coach's tenant. Fresh signups and existing coaches
  // updating their listing are unaffected. Product question logged in
  // docs/remediation-log.md (S2) if "client becomes coach" must be allowed.
  const { data: ownProfile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const ownRole = (ownProfile as { role?: string } | null)?.role;
  if (ownRole !== "coach") {
    const { count: activeClientSubs } = await svc
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("client_id", user.id)
      .eq("status", "active");
    if ((activeClientSubs ?? 0) > 0) {
      return NextResponse.json(
        { error: "This account has active client subscriptions and cannot become a coach. Contact support to convert your account." },
        { status: 403 }
      );
    }
  }

  // 1) profiles: set role + name (full_name is generated from name)
  const profErr = await svc.from("profiles").update({ role: "coach", name: displayName }).eq("id", user.id);
  if (profErr.error) {
    return NextResponse.json(dbError("coaches", profErr.error), { status: 400 });
  }

  // 2) coaches: upsert by user_id (this id is what subscriptions/plans reference)
  const { data: existingCoach } = await svc
    .from("coaches")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  let coachRowId: string;
  if (existingCoach) {
    coachRowId = (existingCoach as { id: string }).id;
    const { error } = await svc
      .from("coaches")
      .update({ bio, price_monthly: priceMonthly, specialization, is_active: true })
      .eq("id", coachRowId);
    if (error) return NextResponse.json(dbError("coaches", error), { status: 400 });
  } else {
    const { data, error } = await svc
      .from("coaches")
      .insert({ user_id: user.id, bio, price_monthly: priceMonthly, specialization, is_active: true })
      .select("id")
      .single();
    if (error) return NextResponse.json(dbError("coaches", error), { status: 400 });
    coachRowId = (data as { id: string }).id;
  }

  // 3) coach_onboarding: the listing row the app's Find a Coach screen reads
  const onboardingFields = {
    user_id: user.id,
    display_name: displayName,
    bio,
    price_monthly: priceMonthly,
    specialization,
    ...(yearsExperience !== null ? { years_experience: yearsExperience } : {}),
    is_completed: body.complete !== false,
  };
  const { data: existingOnboarding } = await svc
    .from("coach_onboarding")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingOnboarding) {
    const { error } = await svc
      .from("coach_onboarding")
      .update(onboardingFields)
      .eq("id", (existingOnboarding as { id: string }).id);
    if (error) return NextResponse.json(dbError("coaches", error), { status: 400 });
  } else {
    const { error } = await svc.from("coach_onboarding").insert(onboardingFields);
    if (error) return NextResponse.json(dbError("coaches", error), { status: 400 });
  }

  return NextResponse.json({ ok: true, coach_id: coachRowId });
}
