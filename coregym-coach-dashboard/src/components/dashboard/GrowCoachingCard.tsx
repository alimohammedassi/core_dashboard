"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";

// Sidebar bottom card (reference layout's "Upgrade to Premium!" slot).
// Stripe configured → lime CTA starts Connect onboarding; already connected →
// links to payouts; otherwise → Settings. Never fakes a state.
export function GrowCoachingCard({
  stripeReady,
  connected,
}: {
  stripeReady: boolean;
  connected: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  async function connect() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data.error ?? t("overview.grow.errorStripe"));
    } catch {
      toast.error(t("overview.grow.errorServer"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-3 mb-3 overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-accent to-muted p-4">
      <div className="flex size-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Sparkles className="size-4" />
      </div>
      <p className="mt-3 text-sm leading-snug font-semibold">{t("overview.grow.title")}</p>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">
        {connected
          ? t("overview.grow.connectedBody")
          : t("overview.grow.connectBody")}
      </p>
      {connected ? (
        <Link
          href="/dashboard/revenue"
          className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-cta text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <CheckCircle2 className="size-3.5" /> {t("overview.grow.viewPayouts")}
        </Link>
      ) : stripeReady ? (
        <button
          type="button"
          onClick={connect}
          disabled={loading}
          className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-cta text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
          {t("overview.grow.connectCta")}
        </button>
      ) : (
        <Link
          href="/dashboard/settings"
          className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-cta text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <ArrowRight className="size-3.5" /> {t("overview.grow.goSettings")}
        </Link>
      )}
    </div>
  );
}
