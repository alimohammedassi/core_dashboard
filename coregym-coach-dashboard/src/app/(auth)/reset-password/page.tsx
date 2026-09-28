"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { describeError } from "@/lib/user-error";
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
// letter, a lowercase letter and a digit.
function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) {
    return "Password must include an uppercase letter, a lowercase letter and a digit";
  }
  return null;
}

export default function ResetPasswordPage() {
  const router = useRouter();
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
    const t = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(t);
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
      toast.error("Enter the verification code from your email");
      return;
    }
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
      if (error) throw error;
      await completeVerification();
    } catch (err: unknown) {
      toast.error(describeError(err, "That code is invalid or has expired. Please request a new one."));
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
      toast.success("If an account exists for this email, a new code has been sent.");
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      toast.error(describeError(err, "Could not send a new code. Please try again."));
    } finally {
      setResending(false);
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(pw);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (pw !== pw2) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      // AUTH-02 pattern: a password change must not leave other sessions alive.
      const { error: revokeErr } = await supabase.auth.signOut({ scope: "others" });
      if (revokeErr) console.error("[reset-password] session revocation failed", revokeErr);
      toast.success("Password updated — sign in with your new password.");
      router.replace("/login");
    } catch (err: unknown) {
      toast.error(
        describeError(err, "Could not update the password. The reset session may have expired — please start again.")
      );
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
              <CardTitle className="text-2xl">Check your email</CardTitle>
              <CardDescription>
                Enter the verification code we sent to{" "}
                <span className="font-medium text-foreground">{email}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Verification code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="8-digit code"
                    maxLength={10}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={verifying || code.trim().length < 6}>
                  {verifying ? "Verifying..." : "Verify code"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Didn&apos;t get it?{" "}
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending || resendIn > 0}
                    className="underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                  </button>
                </p>
                <p className="text-center text-sm text-muted-foreground">
                  <Link href="/forgot-password" className="underline underline-offset-4 hover:text-foreground">
                    Use a different email
                  </Link>
                  {" · "}
                  <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                    Back to login
                  </Link>
                </p>
              </form>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">Choose a new password</CardTitle>
              <CardDescription>
                {googleOnly
                  ? "This account currently signs in with Google. You can set a password to also sign in with your email and password."
                  : "Set a new password for your coach account."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
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
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  At least 8 characters, with an uppercase letter, a lowercase letter and a digit.
                </p>
                <Button type="submit" className="w-full" disabled={saving || !pw || !pw2}>
                  {saving ? "Updating..." : googleOnly ? "Set password" : "Update password"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                    Back to login
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
