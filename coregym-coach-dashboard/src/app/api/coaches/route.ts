import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as CoachPayload;
  const displayName = String(body.display_name ?? "").trim() || user.email || "Coach";
  const bio = String(body.bio ?? "").trim() || null;
  const priceMonthly = Number(body.price_monthly ?? 0);
  const specialization = Array.isArray(body.specialization) ? body.specialization.slice(0, 8).map(String) : [];
  const yearsExperience = Number.isFinite(Number(body.years_experience)) && body.years_experience !== undefined
    ? Number(body.years_experience)
    : null;

  const svc = await createServiceClient();

  // 1) profiles: set role + name (full_name is generated from name)
  const profErr = await svc.from("profiles").update({ role: "coach", name: displayName }).eq("id", user.id);
  if (profErr.error) {
    return NextResponse.json({ error: profErr.error.message }, { status: 400 });
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
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { data, error } = await svc
      .from("coaches")
      .insert({ user_id: user.id, bio, price_monthly: priceMonthly, specialization, is_active: true })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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
    is_completed: true,
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
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await svc.from("coach_onboarding").insert(onboardingFields);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, coach_id: coachRowId });
}
