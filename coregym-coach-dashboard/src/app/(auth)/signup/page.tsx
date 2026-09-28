"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const { t } = useI18n();
  const supabase = React.useMemo(() => createClient(), []);
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
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

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">{t("auth.signup.title")}</CardTitle>
          <CardDescription>{t("auth.signup.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">{t("auth.signup.displayName")}</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                placeholder={t("auth.signup.namePlaceholder")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.signup.emailLabel")}</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.signup.passwordLabel")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("auth.signup.specializations")}</Label>
              <div className="flex flex-wrap gap-2">
                {SPECIALIZATIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSpec(s)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      specializations.includes(s)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="price">{t("auth.signup.priceLabel")}</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  min="0"
                  step="1"
                  value={priceMonthly}
                  onChange={(e) => setPriceMonthly(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="years">{t("auth.signup.yearsLabel")}</Label>
                <Input
                  id="years"
                  type="number"
                  min="0"
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(e.target.value)}
                  placeholder={t("auth.signup.yearsPlaceholder")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">{t("auth.signup.bioLabel")}</Label>
              <Textarea
                id="bio"
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t("auth.signup.bioPlaceholder")}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("auth.signup.creating") : t("auth.signup.createCta")}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t("auth.signup.alreadyCoach")}{" "}
              <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                {t("auth.signup.signInLink")}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
