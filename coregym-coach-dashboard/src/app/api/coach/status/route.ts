import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// Authenticated status probe for the auth flows (login routing + onboarding
// guard). Returns the caller's OWN coach profile completeness — nothing else.
// role/RLS gates downstream remain the real enforcement.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = await createServiceClient();
  const [coachRes, onboardingRes, profileRes] = await Promise.all([
    svc.from("coaches").select("id").eq("user_id", user.id).maybeSingle(),
    svc.from("coach_onboarding").select("is_completed").eq("user_id", user.id).maybeSingle(),
    svc.from("profiles").select("role, name, avatar_url").eq("id", user.id).single(),
  ]);

  const role = (profileRes.data as { role?: string } | null)?.role ?? null;
  const hasCoachRow = Boolean(coachRes.data);
  const coachId = (coachRes.data as { id: string } | null)?.id ?? null;
  const onboardingComplete =
    hasCoachRow && (onboardingRes.data as { is_completed?: boolean } | null)?.is_completed === true;

  return NextResponse.json({
    email: user.email,
    role,
    hasCoachRow,
    coachId,
    onboardingComplete,
    name: (profileRes.data as { name?: string } | null)?.name ?? null,
    avatar_url: (profileRes.data as { avatar_url?: string } | null)?.avatar_url ?? null,
  });
}
