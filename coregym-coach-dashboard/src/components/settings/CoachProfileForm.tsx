"use client";

import * as React from "react";
import { toast } from "sonner";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/coach/profile");
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Could not load your profile");
        setName(body.name ?? "");
        setBio(body.bio ?? "");
        setPrice(String(body.price_monthly ?? 0));
        setExperience(body.years_experience == null ? "" : String(body.years_experience));
        setSpecializations(body.specialization ?? []);
        const p = body.policy ?? {};
        setNoticeDays(p.cancellationNoticeDays == null ? "" : String(p.cancellationNoticeDays));
        setRefundPolicy(p.refundPolicy ?? "");
        setLateFee(p.lateFeeAmount == null ? "" : String(p.lateFeeAmount));
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Could not load your profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
      if (!res.ok) throw new Error(body?.error ?? "Save failed");
      toast.success("Profile saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading your profile…</p>;
  }

  const inputCls = "bg-background";

  return (
    <div className="space-y-5">
      {/* Profile */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cp-bio">Bio</Label>
          <Textarea id="cp-bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1000} className={inputCls} placeholder="Tell clients about your coaching style…" />
          <p className="text-xs text-muted-foreground">{bio.length} / 1000</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cp-exp">Experience (years)</Label>
          <Input id="cp-exp" type="number" min="0" max="60" value={experience} onChange={(e) => setExperience(e.target.value)} className={inputCls} placeholder="e.g. 5" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cp-price">Monthly price (USD)</Label>
          <Input id="cp-price" type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
        </div>
        </div>
        <div className="space-y-2">
          <Label>Specializations</Label>
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
              placeholder="Add custom specialization…"
              className={`h-8 text-sm ${inputCls}`}
            />
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={addCustomSpec}>
              Add
            </Button>
          </div>
        </div>
      </div>

      {/* Policy */}
      <div className="space-y-4 rounded-xl border p-4">
        <div>
          <p className="text-sm font-semibold">Training policy</p>
          <p className="text-xs text-muted-foreground">
            Your cancellation / refund rules. Shown to clients so expectations are clear.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cp-notice">Cancellation notice (days)</Label>
            <Input id="cp-notice" type="number" min="0" max="365" value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} className={inputCls} placeholder="e.g. 24" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-fee">Late / no-show fee (USD)</Label>
            <Input id="cp-fee" type="number" min="0" step="0.5" value={lateFee} onChange={(e) => setLateFee(e.target.value)} className={inputCls} placeholder="e.g. 10" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cp-refund">Refund policy</Label>
          <Textarea
            id="cp-refund"
            rows={3}
            value={refundPolicy}
            onChange={(e) => setRefundPolicy(e.target.value)}
            maxLength={2000}
            className={inputCls}
            placeholder="e.g. Full refund if cancelled more than 24h in advance. No refunds for missed sessions."
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>
          <Save className="mr-1 size-3.5" />
          {saving ? "Saving…" : "Save profile"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={saving}
          onClick={() => window.location.reload()}
        >
          <X className="mr-1 size-3.5" /> Reset
        </Button>
      </div>
    </div>
  );
}
