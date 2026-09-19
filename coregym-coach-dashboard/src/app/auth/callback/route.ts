import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const errorParam = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");

  if (errorParam) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorParam)}&error_description=${encodeURIComponent(errorDesc ?? "")}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {}
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  // After session is set, check for pending coach onboarding (set by /signup before Google OAuth)
  const pendingCookie = cookieStore.get("pending_coach")?.value;
  if (pendingCookie) {
    try {
      const decoded = decodeURIComponent(pendingCookie);
      const pending = JSON.parse(decoded) as {
        display_name?: string;
        bio?: string;
        price_monthly?: number;
        specialization?: string[];
        years_experience?: number;
      };

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const displayName = String(pending.display_name ?? "").trim() || user.email || "Coach";
        const bio = String(pending.bio ?? "").trim() || null;
        const priceMonthly = Number(pending.price_monthly ?? 0);
        const specialization = Array.isArray(pending.specialization) ? pending.specialization.slice(0, 8).map(String) : [];
        const yearsExperience =
          Number.isFinite(Number(pending.years_experience)) && pending.years_experience !== undefined
            ? Number(pending.years_experience)
            : null;

        const svc = await createServiceClient();

        // Ensure profile is coach (idempotent)
        // Note: profiles.id is auth user id, update role+name
        await svc.from("profiles").update({ role: "coach", name: displayName }).eq("id", user.id);

        // Upsert coaches row
        const { data: existingCoach } = await svc.from("coaches").select("id").eq("user_id", user.id).maybeSingle();
        if (existingCoach) {
          const coachId = (existingCoach as { id: string }).id;
          await svc
            .from("coaches")
            .update({ bio, price_monthly: priceMonthly, specialization, is_active: true })
            .eq("id", coachId);
        } else {
          await svc.from("coaches").insert({ user_id: user.id, bio, price_monthly: priceMonthly, specialization, is_active: true });
        }

        // Upsert onboarding listing
        const onboardingFields: Record<string, unknown> = {
          user_id: user.id,
          display_name: displayName,
          bio,
          price_monthly: priceMonthly,
          specialization,
          is_completed: true,
        };
        if (yearsExperience !== null) onboardingFields.years_experience = yearsExperience;

        const { data: existingOnboarding } = await svc
          .from("coach_onboarding")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (existingOnboarding) {
          await svc
            .from("coach_onboarding")
            .update(onboardingFields)
            .eq("id", (existingOnboarding as { id: string }).id);
        } else {
          await svc.from("coach_onboarding").insert(onboardingFields);
        }
      }
    } catch (e) {
      console.error("[auth/callback] pending_coach handling failed", e);
      // don't block login, just continue
    }

    // Clear pending cookie after attempt
    try {
      cookieStore.set("pending_coach", "", { path: "/", maxAge: 0 });
    } catch {}
  } else {
    // No pending – heal legacy Google coaches that have profile role=coach but no coaches row
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const svc = await createServiceClient();
        const { data: prof } = await svc.from("profiles").select("role").eq("id", user.id).single();
        if ((prof as unknown as { role?: string })?.role === "coach") {
          const { data: existingCoach } = await svc.from("coaches").select("id").eq("user_id", user.id).maybeSingle();
          if (!existingCoach) {
            await svc.from("coaches").insert({
              user_id: user.id,
              bio: null,
              price_monthly: 0,
              specialization: [],
              is_active: true,
            });
          }
        }
      }
    } catch (e) {
      console.error("[auth/callback] heal coaches row failed", e);
    }
  }

  // ── Completeness-based routing (never by provider — by profile state) ──
  // Complete coach profile = coaches row + coach_onboarding.is_completed.
  // Incomplete/new users go to onboarding; completed coaches go to the
  // dashboard. Explicit non-coach roles keep the existing access denial.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const svc = await createServiceClient();
      const [coachRes, onboardingRes, profileRes] = await Promise.all([
        svc.from("coaches").select("id").eq("user_id", user.id).maybeSingle(),
        svc.from("coach_onboarding").select("is_completed").eq("user_id", user.id).maybeSingle(),
        svc.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      ]);
      const role = (profileRes.data as { role?: string } | null)?.role;
      if (role && role !== "coach") {
        return NextResponse.redirect(`${origin}/login?error=not_coach`);
      }
      const complete =
        Boolean(coachRes.data) &&
        (onboardingRes.data as { is_completed?: boolean } | null)?.is_completed === true;
      if (!complete) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }
    }
  } catch (e) {
    console.error("[auth/callback] completeness check failed", e);
    // fall through to the intended destination; the dashboard layout gate
    // performs the same check server-side.
  }

  // Ensure we redirect to an allowed path on this origin
  const safeNext = next.startsWith("/") ? next : "/dashboard";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
