import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { requireCoachContext } from "@/lib/workouts";

// Coach profile + policy updates (Settings page). Follows the established
// service-role convention: the live `coaches_update_own` RLS policy is not
// applied, so the route authenticates, resolves the coach, validates, then
// writes with the service role. A coach can only ever update THEMSELVES.
export async function PATCH(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const name = String(body.name ?? "").trim();
  const bio = String(body.bio ?? "").trim();
  const priceMonthly = Number(body.price_monthly);
  const specialization = Array.isArray(body.specialization)
    ? body.specialization.slice(0, 8).map((s) => String(s).trim()).filter(Boolean)
    : [];

  if (name && name.length > 80) {
    return NextResponse.json({ error: "Name is too long (max 80 characters)" }, { status: 400 });
  }
  if (bio.length > 1000) {
    return NextResponse.json({ error: "Bio is too long (max 1000 characters)" }, { status: 400 });
  }
  if (!Number.isFinite(priceMonthly) || priceMonthly < 0) {
    return NextResponse.json({ error: "Monthly price must be zero or a positive number" }, { status: 400 });
  }

  // Structured policy (optional — omitted/null clears it)
  let policy: Record<string, unknown> | null = null;
  const rawPolicy = body.policy as Record<string, unknown> | null | undefined;
  if (rawPolicy != null && typeof rawPolicy === "object") {
    const noticeDays = Number(rawPolicy.cancellationNoticeDays);
    const refundPolicy = String(rawPolicy.refundPolicy ?? "").trim();
    const lateFee = Number(rawPolicy.lateFeeAmount);
    if (rawPolicy.cancellationNoticeDays != null && rawPolicy.cancellationNoticeDays !== "" &&
        (!Number.isInteger(noticeDays) || noticeDays < 0 || noticeDays > 365)) {
      return NextResponse.json({ error: "Cancellation notice must be a whole number between 0 and 365 days" }, { status: 400 });
    }
    if (refundPolicy.length > 2000) {
      return NextResponse.json({ error: "Refund policy is too long (max 2000 characters)" }, { status: 400 });
    }
    if (rawPolicy.lateFeeAmount != null && rawPolicy.lateFeeAmount !== "" &&
        (!Number.isFinite(lateFee) || lateFee < 0)) {
      return NextResponse.json({ error: "Late fee must be zero or a positive number" }, { status: 400 });
    }
    policy = {
      cancellationNoticeDays: rawPolicy.cancellationNoticeDays == null || rawPolicy.cancellationNoticeDays === ""
        ? null
        : noticeDays,
      refundPolicy: refundPolicy || null,
      lateFeeAmount: rawPolicy.lateFeeAmount == null || rawPolicy.lateFeeAmount === "" ? null : lateFee,
    };
  }

  const svc = await createServiceClient();

  const coachUpdate: Record<string, unknown> = {
    bio: bio || null,
    price_monthly: priceMonthly,
    specialization,
  };
  if (policy) coachUpdate.policy = policy;

  const { error: coachErr } = await svc.from("coaches").update(coachUpdate).eq("id", ctx.coachId);
  if (coachErr) {
    // Most common cause: the policy column migration has not been applied yet.
    const hint = coachErr.message.includes("policy")
      ? " (The policy column migration may not be applied yet — supabase/coach_profile_policy_migration.sql)"
      : "";
    return NextResponse.json({ error: coachErr.message + hint }, { status: 400 });
  }

  if (name) {
    const { error: profileErr } = await svc.from("profiles").update({ name }).eq("id", ctx.userId);
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  if (body.years_experience != null && body.years_experience !== "") {
    const years = Number(body.years_experience);
    if (!Number.isInteger(years) || years < 0 || years > 60) {
      return NextResponse.json({ error: "Years of experience must be a whole number between 0 and 60" }, { status: 400 });
    }
    const { error: obErr } = await svc
      .from("coach_onboarding")
      .upsert({ user_id: ctx.userId, years_experience: years }, { onConflict: "user_id" });
    if (obErr) return NextResponse.json({ error: obErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// GET: current profile values for the settings form
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const coachId = await resolveCoachId(supabase, user.id);
  if (coachId === user.id) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const svc = await createServiceClient();
  const [coachRes, profileRes, onboardingRes] = await Promise.all([
    svc.from("coaches").select("bio, price_monthly, specialization, policy").eq("id", coachId).single(),
    svc.from("profiles").select("name").eq("id", user.id).single(),
    svc.from("coach_onboarding").select("years_experience").eq("user_id", user.id).maybeSingle(),
  ]);
  if (coachRes.error) return NextResponse.json({ error: coachRes.error.message }, { status: 400 });

  return NextResponse.json({
    name: (profileRes.data as { name: string | null } | null)?.name ?? "",
    bio: (coachRes.data as { bio: string | null } | null)?.bio ?? "",
    price_monthly: (coachRes.data as { price_monthly: number | null } | null)?.price_monthly ?? 0,
    specialization: (coachRes.data as { specialization: string[] | null } | null)?.specialization ?? [],
    policy: (coachRes.data as { policy: Record<string, unknown> | null } | null)?.policy ?? null,
    years_experience: (onboardingRes.data as { years_experience: number | null } | null)?.years_experience ?? null,
  });
}
