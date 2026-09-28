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

  // AUTH-03: the `pending_coach` cookie branch was removed. Nothing in the
  // tree ever SET that cookie, but if one had been delivered (crafted link,
  // subdomain cookie) this route would have promoted the just-authenticated
  // account to role='coach' via the service role WITHOUT the S2 eligibility
  // check that POST /api/coaches enforces. Coach onboarding for new users is
  // handled by the footprint-based routing below plus POST /api/coaches.
  // Heal legacy Google coaches that have profile role=coach but no coaches row.
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

  // ── Footprint-based routing (never by provider — by application state) ──
  // profiles.role defaults to 'client' for every new user (the trigger never
  // sets it), so role alone cannot tell an existing client from a brand-new
  // sign-in. Application footprint is the discriminator: an existing client
  // has rows in subscriptions / onboarding / daily_summary, a brand-new user
  // has none. Complete coach = coaches row + coach_onboarding.is_completed.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const svc = await createServiceClient();
      const [coachRes, onboardingRes, profileRes, subsRes, clientOnbRes, dailyRes] = await Promise.all([
        svc.from("coaches").select("id").eq("user_id", user.id).maybeSingle(),
        svc.from("coach_onboarding").select("is_completed").eq("user_id", user.id).maybeSingle(),
        svc.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        svc.from("subscriptions").select("id").eq("client_id", user.id).limit(1).maybeSingle(),
        svc.from("onboarding").select("id").eq("user_id", user.id).limit(1).maybeSingle(),
        svc.from("daily_summary").select("id").eq("user_id", user.id).limit(1).maybeSingle(),
      ]);
      const role = (profileRes.data as { role?: string } | null)?.role;
      if (role === "coach") {
        const complete =
          Boolean(coachRes.data) &&
          (onboardingRes.data as { is_completed?: boolean } | null)?.is_completed === true;
        if (!complete) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      } else {
        const hasClientFootprint =
          Boolean(subsRes.data) || Boolean(clientOnbRes.data) || Boolean(dailyRes.data);
        if (hasClientFootprint) {
          return NextResponse.redirect(`${origin}/login?error=not_coach`);
        }
        return NextResponse.redirect(`${origin}/onboarding`);
      }
    }
  } catch (e) {
    console.error("[auth/callback] routing check failed", e);
    // fall through to the intended destination; the dashboard layout gate
    // performs the same check server-side.
  }

  // Ensure we redirect to an allowed path on this origin
  const safeNext = next.startsWith("/") ? next : "/dashboard";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
