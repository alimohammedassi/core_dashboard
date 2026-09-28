"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { describeError } from "@/lib/user-error";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const { t } = useI18n();
  const supabase = React.useMemo(() => createClient(), []);
  const [ready, setReady] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [verified, setVerified] = React.useState(false);
  const [googleOnly, setGoogleOnly] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
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
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        {!verified ? (
          <>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">{t("auth.reset.checkTitle")}</CardTitle>
              <CardDescription>
                {t("auth.reset.checkDescBefore")}{" "}
                <span className="font-medium text-foreground">{email}</span>
                {t("auth.reset.checkDescAfter")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">{t("auth.reset.codeLabel")}</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={t("auth.reset.codePlaceholder")}
                    maxLength={10}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={verifying || code.trim().length < 6}>
                  {verifying ? t("auth.reset.verifying") : t("auth.reset.verifyCode")}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  {t("auth.reset.didntGet")}{" "}
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending || resendIn > 0}
                    className="underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                  >
                    {resendIn > 0
                      ? t("auth.reset.resendIn", { n: resendIn })
                      : t("auth.reset.resendCode")}
                  </button>
                </p>
                <p className="text-center text-sm text-muted-foreground">
                  <Link href="/forgot-password" className="underline underline-offset-4 hover:text-foreground">
                    {t("auth.reset.differentEmail")}
                  </Link>
                  {" · "}
                  <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                    {t("auth.reset.backToLogin")}
                  </Link>
                </p>
              </form>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">{t("auth.reset.newTitle")}</CardTitle>
              <CardDescription>
                {googleOnly
                  ? t("auth.reset.googleOnlyDesc")
                  : t("auth.reset.newDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t("auth.reset.newPasswordLabel")}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t("auth.reset.confirmLabel")}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("auth.reset.policyHint")}</p>
                <Button type="submit" className="w-full" disabled={saving || !pw || !pw2}>
                  {saving
                    ? t("auth.reset.updating")
                    : googleOnly
                      ? t("auth.reset.setPassword")
                      : t("auth.reset.updatePassword")}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                    {t("auth.reset.backToLogin")}
                  </Link>
                </p>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
