import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// AUTH-04: strict static-asset test. The previous check treated ANY path
// containing a "." as a public asset, so e.g. /onboarding/x.y would skip the
// middleware redirect. Only real asset extensions are exempt now.
const STATIC_ASSET_RE = /\.(svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest|mp4|webm|woff2?)$/i;

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    // Password recovery flow pages (mobile-parity OTP flow: no email link,
    // the recovery session is created by verifyOtp on /reset-password itself,
    // so both pages must be reachable without a session).
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");
  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/auth/callback");
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/webhooks") ||
    STATIC_ASSET_RE.test(pathname);
  // S11 defense-in-depth: redirect unauthenticated visitors away from
  // authenticated areas here too (the dashboard layout still enforces it).
  // API routes are excluded — they return their own 401 JSON.
  const needsAuth =
    !isAuthRoute && !isPublicRoute && !isPublicAsset && !pathname.startsWith("/api/");

  const hasSessionCookies = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token") && c.value);

  // PERF-01 (cookieless fast path): without any Supabase auth cookie there is
  // no session to refresh or validate, so skip the auth round-trip entirely.
  // Anonymous visitors (the whole landing/marketing surface and first-hit
  // protected routes) get zero Supabase Auth calls from the middleware.
  if (!hasSessionCookies) {
    if (needsAuth) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // The middleware must never consume the OAuth ?code= parameter on
      // /auth/callback — the callback route owns the PKCE exchange.
      auth: { detectSessionInUrl: false },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && needsAuth) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
