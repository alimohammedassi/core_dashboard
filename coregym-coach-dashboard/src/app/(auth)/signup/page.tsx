"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import {
  AUTH_INPUT_CLASS,
  AUTH_TEXTAREA_CLASS,
  authChipClass,
  authCtaClass,
  authHeadingClass,
  authLabelClass,
} from "@/components/auth/styles";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

// Canonical DB values (subscription_plans / coaches.specialization) — the
// mobile app's "Find a Coach" screen reads these, so they stay English.
const SPECIALIZATIONS = [
  "Weight Loss",
  "Muscle Gain",
  "CrossFit",
  "Boxing",
  "Nutrition",
  "Yoga",
  "Running",
  "Calisthenics",
];

// Coach sign-up for the Core Dashboard website. Customers sign up inside the
// CoreGym mobile app — this page is for coaches only. Onboarding writes the
// coach's rows to the shared database (via /api/coaches) so they appear in the
// app's "Find a Coach" screen immediately.
export default function SignupPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const isEn = lang === "en";
  const supabase = React.useMemo(() => createClient(), []);
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [bio, setBio] = React.useState("");
  const [priceMonthly, setPriceMonthly] = React.useState("300");
  const [yearsExperience, setYearsExperience] = React.useState("");
  const [specializations, setSpecializations] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  function toggleSpec(s: string) {
    setSpecializations((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName || !email || !password) {
      toast.error(t("auth.signup.toasts.missingFields"));
      return;
    }
    if (password.length < 6) {
      toast.error(t("auth.signup.toasts.passwordShort"));
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: displayName, role: "coach" } },
      });
      if (error) throw error;
      if (!data.user) throw new Error("No user returned");
      if (!data.session) {
        toast.info(t("auth.signup.toasts.checkEmail"));
        router.push("/login");
        return;
      }

      const res = await fetch("/api/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          bio,
          price_monthly: Number(priceMonthly) || 0,
          specialization: specializations,
          years_experience: yearsExperience ? Number(yearsExperience) : undefined,
        }),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved?.error ?? t("auth.signup.toasts.onboardingFailed"));

      toast.success(t("auth.signup.toasts.welcome"));
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("auth.signup.toasts.signupFailed"));
    } finally {
      setLoading(false);
    }
  }

  const headingClass = authHeadingClass(isEn);
  const labelClass = authLabelClass(isEn);
  const fieldInput = AUTH_INPUT_CLASS;

  return (
    <AuthShell size="md">
      <h1 className={headingClass}>{t("auth.signup.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{t("auth.signup.subtitle")}</p>

      <form onSubmit={handleSignup} className="mt-7 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="displayName" className={labelClass}>
            {t("auth.signup.displayName")}
          </Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            placeholder={t("auth.signup.namePlaceholder")}
            className={fieldInput}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
          <div className="space-y-2">
            <Label htmlFor="email" className={labelClass}>
              {t("auth.signup.emailLabel")}
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={fieldInput}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className={labelClass}>
              {t("auth.signup.passwordLabel")}
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className={`${fieldInput} pe-11`}
              />
              <PasswordToggle show={showPassword} onToggle={() => setShowPassword((p) => !p)} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className={labelClass}>{t("auth.signup.specializations")}</Label>
          <div className="flex flex-wrap gap-2">
            {SPECIALIZATIONS.map((s) => {
              const selected = specializations.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSpec(s)}
                  aria-pressed={selected}
                  className={authChipClass(selected)}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="price" className={labelClass}>
              {t("auth.signup.priceLabel")}
            </Label>
            <Input
              id="price"
              name="price"
              type="number"
              min="0"
              step="1"
              value={priceMonthly}
              onChange={(e) => setPriceMonthly(e.target.value)}
              className={fieldInput}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="years" className={labelClass}>
              {t("auth.signup.yearsLabel")}
            </Label>
            <Input
              id="years"
              type="number"
              min="0"
              value={yearsExperience}
              onChange={(e) => setYearsExperience(e.target.value)}
              placeholder={t("auth.signup.yearsPlaceholder")}
              className={fieldInput}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio" className={labelClass}>
            {t("auth.signup.bioLabel")}
          </Label>
          <Textarea
            id="bio"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t("auth.signup.bioPlaceholder")}
            className={AUTH_TEXTAREA_CLASS}
          />
        </div>

        <button type="submit" disabled={loading} className={authCtaClass(isEn)}>
          {loading ? (
            <>
              <Spinner className="text-[#161806]" />
              {t("auth.signup.creating")}
            </>
          ) : (
            t("auth.signup.createCta")
          )}
        </button>

        <p className="text-center text-sm text-white/60">
          {t("auth.signup.alreadyCoach")}{" "}
          <Link
            href="/login"
            className="underline-offset-4 transition-colors hover:text-volt hover:underline"
          >
            {t("auth.signup.signInLink")}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
