"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";

export function SettingsClient({ stripeAccountId }: { stripeAccountId: string | null }) {
  const { t } = useI18n();
  const [loading, setLoading] = React.useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? t("settings.payouts.failedStatus", { code: res.status }));
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.success(t("settings.payouts.readyMock"));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("settings.payouts.connectFailed");
      // Mock fallback when Stripe not configured
      if (msg.includes("not configured") || msg.includes("placeholder")) {
        toast.info(t("settings.payouts.keysPlaceholder"), {
          description: t("settings.payouts.keysPlaceholderDesc"),
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button onClick={handleConnect} disabled={loading}>
        {loading ? t("settings.payouts.connecting") : stripeAccountId ? t("settings.payouts.manage") : t("settings.payouts.connect")}
      </Button>
      <Button variant="outline" onClick={() => toast.info(t("settings.payouts.dashToast"))}>
        {t("settings.payouts.openDash")}
      </Button>
    </div>
  );
}
