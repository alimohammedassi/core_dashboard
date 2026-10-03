"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { AuthOrDivider, GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { useGoogleAuth } from "@/components/auth/useGoogleAuth";
import {
  AUTH_INPUT_CLASS,
  authCtaClass,
  authHeadingClass,
  authLabelClass,
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
  const { googleAvailable, googleLoading, startGoogle } = useGoogleAuth(
    "auth.login.toasts.googleFailed",
  );

  // Surface OAuth redirect errors (cancelled consent, provider failure,
  // non-coach account) that come back through /auth/callback.
  React.useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err === "oauth_cancelled") toast.error(t("auth.login.toasts.googleCancelled"));
    else if (err === "not_coach") toast.error(t("auth.login.toasts.googleNotCoach"));
    else if (err) toast.error(t("auth.login.toasts.googleFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <AuthOrDivider isEn={isEn} label={t("auth.login.or")} />
            <GoogleAuthButton
              isEn={isEn}
              loading={googleLoading}
              disabled={googleLoading || loading}
              onClick={startGoogle}
              label={t("auth.login.continueWithGoogle")}
              loadingLabel={t("auth.login.redirectingToGoogle")}
            />
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
