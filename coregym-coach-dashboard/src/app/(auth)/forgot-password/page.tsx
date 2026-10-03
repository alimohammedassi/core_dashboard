"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { describeError } from "@/lib/user-error";
import { useI18n } from "@/lib/i18n/client";
import { AuthShell } from "@/components/auth/AuthShell";
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

// Password recovery step 1 — request a verification code.
// Mirrors the mobile app's ForgotPasswordScreen: Supabase emails an 8-digit
// OTP (the shared "Reset password" template prints {{ .Token }}), the user
// completes the flow on /reset-password. No email link, no deep link, so no
// redirectTo is passed and /auth/callback stays OAuth-only.
export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const isEn = lang === "en";
  const supabase = React.useMemo(() => createClient(), []);
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error(t("auth.forgot.toasts.missingEmail"));
      return;
    }
    setLoading(true);
    try {
      // No account-existence lookup and no provider detection here — the
      // generic response prevents user enumeration.
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
      if (error) throw error;
      toast.success(t("auth.forgot.toasts.codeSent"));
      router.push(`/reset-password?email=${encodeURIComponent(trimmed)}`);
    } catch (err: unknown) {
      toast.error(describeError(err, t("auth.forgot.toasts.sendFailed")));
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h1 className={authHeadingClass(isEn)}>{t("auth.forgot.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{t("auth.forgot.subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className={authLabelClass(isEn)}>
            {t("auth.forgot.emailLabel")}
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t("auth.forgot.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={AUTH_INPUT_CLASS}
          />
        </div>

        <button type="submit" disabled={loading} className={authCtaClass(isEn)}>
          {loading ? (
            <>
              <Spinner className="text-[#161806]" />
              {t("auth.forgot.sending")}
            </>
          ) : (
            t("auth.forgot.sendCode")
          )}
        </button>

        <p className="text-center text-sm text-white/60">
          <Link
            href="/login"
            className="underline-offset-4 transition-colors hover:text-volt hover:underline"
          >
            {t("auth.forgot.backToLogin")}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
