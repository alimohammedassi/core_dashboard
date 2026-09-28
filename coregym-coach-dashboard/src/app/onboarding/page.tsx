"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarUpload } from "@/components/settings/SettingsSections";
import { CredentialsManager } from "@/components/settings/CredentialsManager";

// Coach onboarding wizard (Google-first + incomplete accounts). Completion
// state lives server-side in coach_onboarding.is_completed — this wizard only
// collects data and calls the existing service-role onboarding APIs.
const STEP_KEYS = ["basics", "professional", "achievements", "certificates", "review"] as const;

// Canonical DB values (coaches.specialization, also read back on prefill) —
// the mobile app's "Find a Coach" screen shows these, so they stay English.
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

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useI18n();
  const supabase = React.useMemo(() => createClient(), []);

  const [authState, setAuthState] = React.useState<"checking" | "ready" | "unauthed" | "complete">("checking");
  const [userId, setUserId] = React.useState<string | null>(null);
  const [coachId, setCoachId] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");
  const [savingStep, setSavingStep] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);
  const [step, setStep] = React.useState(1);

  // profile state
  const [name, setName] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [bio, setBio] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [specializations, setSpecializations] = React.useState<string[]>([]);
  const [customSpec, setCustomSpec] = React.useState("");
  const [experience, setExperience] = React.useState("");

  const stepLabel = (i: number) => t(`auth.onboarding.steps.${STEP_KEYS[i]}`);

  // ── Guard + prefill on mount ────────────────────────────────────────────────
  React.useEffect(() => {
    (async () => {
      try {
        const statusRes = await fetch("/api/coach/status");
        if (statusRes.status === 401) {
          setAuthState("unauthed");
          router.replace("/login");
          return;
        }
        const status = await statusRes.json();
        // Fully onboarded coaches never see the wizard
        if (status.onboardingComplete) {
          setAuthState("complete");
          router.replace("/dashboard");
          return;
        }
        setAuthState("ready");
        setEmail(status.email ?? "");
        // prefill from whatever was saved before (resume never loses data)
        if (status.hasCoachRow && status.coachId) {
          setCoachId(status.coachId);
          const profRes = await fetch('/api/coach/profile');
          if (profRes.ok) {
            const prof = await profRes.json();
            setName((prev) => prev || prof.name || '');
            setBio(prof.bio ?? '');
            setPrice(prof.price_monthly != null ? String(prof.price_monthly) : '');
            setSpecializations(prof.specialization ?? []);
            setExperience(prof.years_experience == null ? '' : String(prof.years_experience));
          }
        }
        // Google display-name prefill from metadata
        const { data } = await supabase.auth.getUser();
        setUserId(data.user?.id ?? null);
        const meta = (data.user?.user_metadata ?? {}) as { full_name?: string; name?: string; picture?: string };
        setName((prev) => prev || meta.full_name || meta.name || "");
        if (meta.picture && !status.hasCoachRow) setAvatarUrl(meta.picture);
      } catch {
        toast.error(t("auth.onboarding.toasts.verifyFailed"));
        setAuthState("unauthed");
        router.replace("/login");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save helpers ────────────────────────────────────────────────────────────
  async function saveBasic() {
    if (!name.trim()) {
      toast.error(t("auth.onboarding.toasts.nameRequired"));
      return false;
    }
    setSavingStep(true);
    try {
      const res = await fetch("/api/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: name.trim(),
          bio: bio.trim(),
          complete: false, // onboarding in progress — not treated as done
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? t("auth.onboarding.toasts.saveBasicFailed"));
      if (body.coach_id) setCoachId(body.coach_id);
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("auth.onboarding.toasts.saveBasicFailed"));
      return false;
    } finally {
      setSavingStep(false);
    }
  }

  async function saveProfessional() {
    setSavingStep(true);
    try {
      const res = await fetch("/api/coach/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio: bio.trim(),
          price_monthly: Number(price) || 0,
          specialization: specializations,
          years_experience: experience === "" ? null : Number(experience),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? t("auth.onboarding.toasts.saveProfessionalFailed"));
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("auth.onboarding.toasts.saveProfessionalFailed"));
      return false;
    } finally {
      setSavingStep(false);
    }
  }

  async function handleComplete() {
    setFinishing(true);
    try {
      const res = await fetch("/api/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: name.trim(),
          bio: bio.trim(),
          price_monthly: Number(price) || 0,
          specialization: specializations,
          years_experience: experience === "" ? undefined : Number(experience),
          complete: true, // mark coach_onboarding.is_completed = true
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? t("auth.onboarding.toasts.completeFailed"));
      toast.success(t("auth.onboarding.toasts.live"));
      router.replace("/dashboard");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("auth.onboarding.toasts.completeFailed"));
      setFinishing(false);
    }
  }

  // ── Guards ──────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (authState === "unauthed") router.replace("/login");
    if (authState === "complete") router.replace("/dashboard");
  }, [authState, router]);

  if (authState !== "ready") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const next = async () => {
    if (step === 1) {
      const ok = await saveBasic();
      if (!ok) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      const ok = await saveProfessional();
      if (!ok) return;
      setStep(3);
      return;
    }
    setStep((s) => Math.min(s + 1, 5));
  };

  const back = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">{t("auth.onboarding.kicker")}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{t("auth.onboarding.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("auth.onboarding.stepOf", {
              n: step,
              total: STEP_KEYS.length,
              label: stepLabel(step - 1),
            })}
          </p>
          <div className="mt-4 flex gap-1.5">
            {STEP_KEYS.map((key, i) => (
              <div
                key={key}
                className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-primary" : "bg-muted"}`}
                aria-hidden
              />
            ))}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{stepLabel(step - 1)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ob-name">{t("auth.onboarding.fullName")}</Label>
                  <Input
                    id="ob-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    placeholder={t("auth.onboarding.namePlaceholder")}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">{t("auth.onboarding.nameHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("auth.onboarding.profilePhoto")}</Label>
                  {userId ? (
                    <AvatarUpload initialUrl={avatarUrl} userId={userId} onSaved={setAvatarUrl} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("auth.onboarding.photoLater")}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ob-email">{t("auth.onboarding.emailLabel")}</Label>
                  <Input id="ob-email" value={email} readOnly disabled className="bg-muted/40" />
                  <p className="text-xs text-muted-foreground">{t("auth.onboarding.emailHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ob-bio">{t("auth.onboarding.bioLabel")}</Label>
                  <Textarea
                    id="ob-bio"
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={1000}
                    placeholder={t("auth.onboarding.bioPlaceholder")}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("auth.onboarding.phoneNote")}</p>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-xs text-muted-foreground">{t("auth.onboarding.professionalNote")}</p>
                <div className="space-y-2">
                  <Label>{t("auth.onboarding.specialties")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {[...new Set([...SPECIALIZATIONS, ...specializations])].map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() =>
                          setSpecializations((prev) =>
                            prev.includes(sp) ? prev.filter((x) => x !== sp) : [...prev, sp]
                          )
                        }
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          specializations.includes(sp)
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {sp}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={customSpec}
                      onChange={(e) => setCustomSpec(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const v = customSpec.trim();
                          if (v) setSpecializations((prev) => [...prev, v]);
                          setCustomSpec("");
                        }
                      }}
                      placeholder={t("auth.onboarding.customSpecPlaceholder")}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ob-years">{t("auth.onboarding.yearsLabel")}</Label>
                  <Input
                    id="ob-years"
                    type="number"
                    min="0"
                    max="60"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    placeholder={t("auth.onboarding.yearsPlaceholder")}
                  />
                </div>
                <p className="rounded-lg border p-3 text-xs text-muted-foreground">
                  {t("auth.onboarding.schemaNote")}
                </p>
              </>
            )}

            {step === 3 && coachId && (
              <CredentialsManager
                coachId={coachId}
                userId={userId ?? ""}
                type="achievement"
                accept="image/jpeg,image/png,image/webp"
                emptyText={t("auth.onboarding.emptyAchievements")}
              />
            )}

            {step === 4 && coachId && (
              <CredentialsManager
                coachId={coachId}
                userId={userId ?? ""}
                type="certificate"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                emptyText={t("auth.onboarding.emptyCertificates")}
              />
            )}

            {step === 5 && (
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    {t("auth.onboarding.steps.basics")}
                  </p>
                  <p className="mt-1">{t("auth.onboarding.review.name")} {name.trim() || "—"}</p>
                  <p>{t("auth.onboarding.review.email")} {email || "—"}</p>
                  <p className="whitespace-pre-wrap">{t("auth.onboarding.review.bio")} {bio.trim() || "—"}</p>
                  <p>
                    {t("auth.onboarding.review.photo")}{" "}
                    {avatarUrl ? t("auth.onboarding.review.uploaded") : t("auth.onboarding.review.notSet")}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    {t("auth.onboarding.steps.professional")}
                  </p>
                  <p>
                    {t("auth.onboarding.review.specialties")}{" "}
                    {specializations.length ? specializations.join(", ") : "—"}
                  </p>
                  <p>
                    {t("auth.onboarding.review.experience")}{" "}
                    {experience === "" ? "—" : t("auth.onboarding.review.yearsValue", { n: experience })}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    {t("auth.onboarding.review.uploads")}
                  </p>
                  <p>{t("auth.onboarding.review.uploadsNote")}</p>
                </div>
                <p className="text-xs text-muted-foreground">{t("auth.onboarding.review.finalNote")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-between">
          <Button type="button" variant="outline" onClick={back} disabled={step === 1 || savingStep || finishing}>
            <ArrowLeft className="me-1 size-4 rtl:rotate-180" /> {t("common.actions.back")}
          </Button>
          {step < 5 ? (
            <Button type="button" onClick={next} disabled={savingStep || finishing}>
              {savingStep ? <Loader2 className="me-1 size-4 animate-spin" /> : null}
              {step === 1 ? t("auth.onboarding.saveContinue") : t("common.actions.continue")}{" "}
              <ArrowRight className="ms-1 size-4 rtl:rotate-180" />
            </Button>
          ) : (
            <Button type="button" onClick={handleComplete} disabled={finishing}>
              {finishing ? <Loader2 className="me-1 size-4 animate-spin" /> : <Check className="me-1 size-4" />}
              {finishing ? t("auth.onboarding.completing") : t("auth.onboarding.complete")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
