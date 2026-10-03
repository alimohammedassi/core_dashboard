"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import {
  AUTH_INPUT_CLASS,
  authCtaClass,
  authGhostPillClass,
  authHeadingClass,
  authLabelClass,
  authMicroLabelClass,
} from "@/components/auth/styles";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const isEn = lang === "en";
  const supabase = React.useMemo(() => createClient(), []);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [googleAvailable, setGoogleAvailable] = React.useState<boolean | null>(null); // null = probing

  // Surface OAuth redirect errors (cancelled consent, provider failure,
  // non-coach account) that come back through /auth/callback.
  React.useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err === "oauth_cancelled") toast.error(t("auth.login.toasts.googleCancelled"));
    else if (err === "not_coach") toast.error(t("auth.login.toasts.googleNotCoach"));
    else if (err) toast.error(t("auth.login.toasts.googleFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only offer Google sign-in when the provider is enabled in Supabase Auth
  // (public settings endpoint — no secrets involved).
  React.useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
    })
      .then((r) => r.json())
      .then((j) => setGoogleAvailable(Boolean(j.external?.google)))
      .catch(() => setGoogleAvailable(false));
  }, []);

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthErr) throw oauthErr;
      // Browser redirects to Google; the callback completes sign-in.
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("auth.login.toasts.googleFailed"));
      setGoogleLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error(t("auth.login.toasts.missingFields"));
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error("No user returned");

      // Verify coach role
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (profileErr) {
        // If profiles table missing or RLS blocks, allow but warn
        console.warn("Profile fetch failed", profileErr.message);
        toast.warning(t("auth.login.toasts.profileCheckFailed"));
        router.push("/dashboard");
        router.refresh();
        return;
      }

      if (profile?.role !== "coach") {
        await supabase.auth.signOut();
        toast.error(t("auth.login.toasts.accessDenied"), {
          description: t("auth.login.toasts.accessDeniedDesc", {
            role: profile?.role ?? t("common.state.unknown"),
          }),
        });
        return;
      }

      toast.success(t("auth.login.toasts.welcome"));
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("auth.login.toasts.loginFailed");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  // Landing heading idiom — tight extrabold caps read only in Latin script;
  // Arabic drops uppercase/tracking so letter joins stay intact.
  const headingClass = authHeadingClass(isEn);
  const labelClass = authLabelClass(isEn);
  const fieldInput = AUTH_INPUT_CLASS;

  return (
    <AuthShell>
      <h1 className={headingClass}>{t("auth.login.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{t("auth.login.subtitle")}</p>

      <form onSubmit={handleLogin} className="mt-7 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className={labelClass}>
            {t("auth.login.emailLabel")}
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t("auth.login.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={fieldInput}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password" className={labelClass}>
              {t("auth.login.passwordLabel")}
            </Label>
            <Link
              href="/forgot-password"
              className="text-xs text-white/50 underline-offset-4 transition-colors hover:text-volt hover:underline"
            >
              {t("auth.login.forgotPassword")}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={`${fieldInput} pe-11`}
            />
            <PasswordToggle show={showPassword} onToggle={() => setShowPassword((p) => !p)} />
          </div>
        </div>

        <button type="submit" disabled={loading} className={authCtaClass(isEn)}>
          {loading ? (
            <>
              <Spinner className="text-[#161806]" />
              {t("auth.login.signingIn")}
            </>
          ) : (
            <>
              {t("auth.login.signIn")}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </>
          )}
        </button>

        {googleAvailable !== false && (
          <>
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/[0.08]" />
              </div>
              <div className="relative flex justify-center">
                <span
                  className={`bg-[#121310] px-2 text-white/40 ${authMicroLabelClass(isEn)}`}
                >
                  {t("auth.login.or")}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading || loading}
              className={authGhostPillClass(isEn)}
            >
              {googleLoading ? (
                <>
                  <Spinner />
                  {t("auth.login.redirectingToGoogle")}
                </>
              ) : (
                <>
                  <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
                    />
                  </svg>
                  {t("auth.login.continueWithGoogle")}
                </>
              )}
            </button>
          </>
        )}
      </form>

      <div className="mt-6 space-y-2 text-center">
        <p className="text-sm text-white/60">
          <Link
            href="/signup"
            className="underline-offset-4 transition-colors hover:text-volt hover:underline"
          >
            {t("auth.login.newCoachCta")}
          </Link>
        </p>
        <p className="text-xs text-white/40">
          <Link
            href="/"
            className="underline-offset-4 transition-colors hover:text-white/80 hover:underline"
          >
            {t("auth.login.backToHome")}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
