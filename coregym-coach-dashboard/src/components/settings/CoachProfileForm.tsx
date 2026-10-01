"use client";

import * as React from "react";
import { toast } from "sonner";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/client";

// Suggested specializations are stored in the DB (specialization[]) and shown
// on the public coach profile, so they stay canonical English values — they
// are data, not UI chrome. Coaches can add their own custom values.
const SUGGESTED_SPECIALIZATIONS = [
  "Weight Loss",
  "Muscle Gain",
  "CrossFit",
  "Boxing",
  "Nutrition",
  "Yoga",
  "Running",
  "Calisthenics",
];

export function CoachProfileForm() {
  const { t, fmt } = useI18n();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [price, setPrice] = React.useState("0");
  const [experience, setExperience] = React.useState("");
  const [specializations, setSpecializations] = React.useState<string[]>([]);
  const [customSpec, setCustomSpec] = React.useState("");
  const [noticeDays, setNoticeDays] = React.useState("");
  const [refundPolicy, setRefundPolicy] = React.useState("");
  const [lateFee, setLateFee] = React.useState("");
  // Snapshot of the last loaded/saved values — Save stays disabled until
  // something actually differs (dirty-state pattern for this form).
  const [initial, setInitial] = React.useState<{
    name: string;
    bio: string;
    price: string;
    experience: string;
    specializations: string[];
    noticeDays: string;
    refundPolicy: string;
    lateFee: string;
  } | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/coach/profile");
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? t("settings.professional.form.loadFailed"));
        const p = body.policy ?? {};
        const snapshot = {
          name: body.name ?? "",
          bio: body.bio ?? "",
          price: String(body.price_monthly ?? 0),
          experience: body.years_experience == null ? "" : String(body.years_experience),
          specializations: body.specialization ?? [],
          noticeDays: p.cancellationNoticeDays == null ? "" : String(p.cancellationNoticeDays),
          refundPolicy: p.refundPolicy ?? "",
          lateFee: p.lateFeeAmount == null ? "" : String(p.lateFeeAmount),
        };
        setName(snapshot.name);
        setBio(snapshot.bio);
        setPrice(snapshot.price);
        setExperience(snapshot.experience);
        setSpecializations(snapshot.specializations);
        setNoticeDays(snapshot.noticeDays);
        setRefundPolicy(snapshot.refundPolicy);
        setLateFee(snapshot.lateFee);
        setInitial(snapshot);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : t("settings.professional.form.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  function toggleSpec(s: string) {
    setSpecializations((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function addCustomSpec() {
    const v = customSpec.trim();
    if (!v) return;
    setSpecializations((prev) => (prev.some((x) => x.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]));
    setCustomSpec("");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/coach/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          bio: bio.trim(),
          price_monthly: Number(price) || 0,
          years_experience: experience === "" ? null : Number(experience),
          specialization: specializations,
          policy: {
            cancellationNoticeDays: noticeDays === "" ? null : Number(noticeDays),
            refundPolicy: refundPolicy.trim(),
            lateFeeAmount: lateFee === "" ? null : Number(lateFee),
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? t("settings.professional.form.saveFailed"));
      setInitial({
        name,
        bio,
        price,
        experience,
        specializations,
        noticeDays,
        refundPolicy,
        lateFee,
      });
      toast.success(t("settings.professional.form.saved"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.professional.form.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("settings.professional.form.loading")}</p>;
  }

  const dirty =
    initial == null ||
    name !== initial.name ||
    bio !== initial.bio ||
    price !== initial.price ||
    experience !== initial.experience ||
    JSON.stringify(specializations) !== JSON.stringify(initial.specializations) ||
    noticeDays !== initial.noticeDays ||
    refundPolicy !== initial.refundPolicy ||
    lateFee !== initial.lateFee;

  const inputCls = "bg-background";

  return (
    <div className="space-y-5">
      {/* Profile */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cp-bio">{t("settings.professional.form.bio")}</Label>
          <Textarea id="cp-bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1000} className={inputCls} placeholder={t("settings.professional.form.bioPlaceholder")} />
          <p className="text-xs text-muted-foreground">{t("settings.professional.form.charCount", { count: fmt.num(bio.length) })}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cp-exp">{t("settings.professional.form.experience")}</Label>
          <Input id="cp-exp" type="number" min="0" max="60" value={experience} onChange={(e) => setExperience(e.target.value)} className={inputCls} placeholder={t("settings.professional.form.experiencePlaceholder")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cp-price">{t("settings.professional.form.price")}</Label>
          <Input id="cp-price" type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
        </div>
        </div>
        <div className="space-y-2">
          <Label>{t("settings.professional.form.specializations")}</Label>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...SUGGESTED_SPECIALIZATIONS, ...specializations])].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSpec(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  specializations.includes(s)
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted " + inputCls
                }`}
              >
                {s}
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
                  addCustomSpec();
                }
              }}
              placeholder={t("settings.professional.form.customPlaceholder")}
              className={`h-8 text-sm ${inputCls}`}
            />
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={addCustomSpec}>
              {t("common.actions.add")}
            </Button>
          </div>
        </div>
      </div>

      {/* Policy */}
      <div className="space-y-4 rounded-xl border p-4">
        <div>
          <p className="text-sm font-semibold">{t("settings.professional.form.policyTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {t("settings.professional.form.policyDesc")}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cp-notice">{t("settings.professional.form.notice")}</Label>
            <Input id="cp-notice" type="number" min="0" max="365" value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} className={inputCls} placeholder={t("settings.professional.form.noticePlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-fee">{t("settings.professional.form.lateFee")}</Label>
            <Input id="cp-fee" type="number" min="0" step="0.5" value={lateFee} onChange={(e) => setLateFee(e.target.value)} className={inputCls} placeholder={t("settings.professional.form.lateFeePlaceholder")} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cp-refund">{t("settings.professional.form.refund")}</Label>
          <Textarea
            id="cp-refund"
            rows={3}
            value={refundPolicy}
            onChange={(e) => setRefundPolicy(e.target.value)}
            maxLength={2000}
            className={inputCls}
            placeholder={t("settings.professional.form.refundPlaceholder")}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
          <Save className="me-1 size-3.5" />
          {saving ? t("common.actions.saving") : t("settings.professional.form.save")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={saving}
          onClick={() => window.location.reload()}
        >
          <X className="me-1 size-3.5" /> {t("common.actions.reset")}
        </Button>
      </div>
    </div>
  );
}
