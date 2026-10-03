"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { describeError } from "@/lib/user-error";
import { useI18n } from "@/lib/i18n/client";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
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

// Password recovery steps 2+3 — verify the emailed OTP, then set a new
// password. Mirrors the mobile app's VerifyCodeScreen (verifyOTP with type
// "recovery" signs the user in) + ResetPasswordScreen (updateUser). The
// sensitive step (updateUser) is impossible without the recovery session
// that verification creates — Supabase Auth enforces this server-side.
const RESEND_COOLDOWN_SECONDS = 60;

// Same policy as the mobile app: at least 8 characters with an uppercase
// letter, a lowercase letter and a digit. Returns the i18n key of the problem.
function passwordProblem(
  pw: string,
): "auth.reset.errors.passwordShort" | "auth.reset.errors.passwordWeak" | null {
  if (pw.length < 8) return "auth.reset.errors.passwordShort";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) {
    return "auth.reset.errors.passwordWeak";
  }
  return null;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const isEn = lang === "en";
  const supabase = React.useMemo(() => createClient(), []);
  const [ready, setReady] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [verified, setVerified] = React.useState(false);
  const [googleOnly, setGoogleOnly] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [showPw2, setShowPw2] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);

  React.useEffect(() => {
    const em = new URLSearchParams(window.location.search).get("email");
    if (!em) {
      router.replace("/forgot-password");
      return;
    }
    // All state updates happen in the getSession continuation (never
    // synchronously in the effect body). If a session already exists (e.g.
    // the email also contained a link that produced one), skip the code step.
    supabase.auth.getSession().then(({ data }) => {
      setEmail(em);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setReady(true);
      if (data.session) void completeVerification();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  // Recovery sign-in complete — inspect the account's linked identities to
  // tailor the copy. Server-truthful data only (identities); never the email
  // domain and never user_metadata.
  async function completeVerification() {
    const { data } = await supabase.auth.getUser();
    const providers = (data.user?.identities ?? []).map((i) => i.provider);
    setGoogleOnly(!providers.includes("email") && providers.includes("google"));
    setVerified(true);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const token = code.trim();
    if (!email || token.length < 6) {
      toast.error(t("auth.reset.errors.missingCode"));
      return;
    }
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
      if (error) throw error;
      await completeVerification();
    } catch (err: unknown) {
      toast.error(describeError(err, t("auth.reset.errors.invalidCode")));
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (!email || resending || resendIn > 0) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      toast.success(t("auth.reset.toasts.codeSent"));
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      toast.error(describeError(err, t("auth.reset.errors.resendFailed")));
    } finally {
      setResending(false);
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(pw);
    if (problem) {
      toast.error(t(problem));
      return;
    }
    if (pw !== pw2) {
      toast.error(t("auth.reset.errors.mismatch"));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      // AUTH-02 pattern: a password change must not leave other sessions alive.
      const { error: revokeErr } = await supabase.auth.signOut({ scope: "others" });
      if (revokeErr) console.error("[reset-password] session revocation failed", revokeErr);
      toast.success(t("auth.reset.toasts.updated"));
      router.replace("/login");
    } catch (err: unknown) {
      toast.error(describeError(err, t("auth.reset.errors.updateFailed")));
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  return (
    <AuthShell>
      {!verified ? (
        <>
          <h1 className={authHeadingClass(isEn)}>{t("auth.reset.checkTitle")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            {t("auth.reset.checkDescBefore")}{" "}
            <span className="font-medium text-[#eceee2]">{email}</span>
            {t("auth.reset.checkDescAfter")}
          </p>

          <form onSubmit={handleVerify} className="mt-7 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="code" className={authLabelClass(isEn)}>
                {t("auth.reset.codeLabel")}
              </Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t("auth.reset.codePlaceholder")}
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
                required
                className="h-11 rounded-xl border-white/10 bg-white/[0.04] px-3.5 text-center text-lg font-semibold tracking-[0.25em] md:h-10 dark:bg-white/[0.04]"
              />
            </div>

            <button
              type="submit"
              disabled={verifying || code.trim().length < 6}
              className={authCtaClass(isEn)}
            >
              {verifying ? (
                <>
                  <Spinner className="text-[#161806]" />
                  {t("auth.reset.verifying")}
                </>
              ) : (
                t("auth.reset.verifyCode")
              )}
            </button>

            <p className="text-center text-sm text-white/60">
              {t("auth.reset.didntGet")}{" "}
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || resendIn > 0}
                className="underline-offset-4 transition-colors hover:text-volt hover:underline disabled:opacity-50"
              >
                {resendIn > 0
                  ? t("auth.reset.resendIn", { n: resendIn })
                  : t("auth.reset.resendCode")}
              </button>
            </p>

            <p className="text-center text-xs text-white/40">
              <Link
                href="/forgot-password"
                className="underline-offset-4 transition-colors hover:text-white/80 hover:underline"
              >
                {t("auth.reset.differentEmail")}
              </Link>
              {" · "}
              <Link
                href="/login"
                className="underline-offset-4 transition-colors hover:text-white/80 hover:underline"
              >
                {t("auth.reset.backToLogin")}
              </Link>
            </p>
          </form>
        </>
      ) : (
        <>
          <h1 className={authHeadingClass(isEn)}>{t("auth.reset.newTitle")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            {googleOnly ? t("auth.reset.googleOnlyDesc") : t("auth.reset.newDesc")}
          </p>

          <form onSubmit={handleSetPassword} className="mt-7 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password" className={authLabelClass(isEn)}>
                {t("auth.reset.newPasswordLabel")}
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  required
                  minLength={8}
                  className={`${AUTH_INPUT_CLASS} pe-11`}
                />
                <PasswordToggle show={showPw} onToggle={() => setShowPw((p) => !p)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className={authLabelClass(isEn)}>
                {t("auth.reset.confirmLabel")}
              </Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showPw2 ? "text" : "password"}
                  autoComplete="new-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  required
                  className={`${AUTH_INPUT_CLASS} pe-11`}
                />
                <PasswordToggle show={showPw2} onToggle={() => setShowPw2((p) => !p)} />
              </div>
            </div>

            <p className="text-xs leading-relaxed text-white/40">{t("auth.reset.policyHint")}</p>

            <button
              type="submit"
              disabled={saving || !pw || !pw2}
              className={authCtaClass(isEn)}
            >
              {saving ? (
                <>
                  <Spinner className="text-[#161806]" />
                  {t("auth.reset.updating")}
                </>
              ) : googleOnly ? (
                t("auth.reset.setPassword")
              ) : (
                t("auth.reset.updatePassword")
              )}
            </button>

            <p className="text-center text-sm text-white/60">
              <Link
                href="/login"
                className="underline-offset-4 transition-colors hover:text-volt hover:underline"
              >
                {t("auth.reset.backToLogin")}
              </Link>
            </p>
          </form>
        </>
      )}
    </AuthShell>
  );
}
