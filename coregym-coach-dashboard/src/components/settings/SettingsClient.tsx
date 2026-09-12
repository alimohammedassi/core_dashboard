"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SettingsClient({ stripeAccountId }: { stripeAccountId: string | null }) {
  const [loading, setLoading] = React.useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed: ${res.status}`);
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.success("Stripe account ready (mock)");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connect failed";
      // Mock fallback when Stripe not configured
      if (msg.includes("not configured") || msg.includes("placeholder")) {
        toast.info("Stripe keys are placeholders — connect flow will work after you add STRIPE_SECRET_KEY.", {
          description: "See .env.local and supabase/schema.sql (stripe_account_id column).",
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
        {loading ? "Connecting…" : stripeAccountId ? "Manage payouts" : "Connect payouts"}
      </Button>
      <Button variant="outline" onClick={() => toast.info("Stripe dashboard: https://dashboard.stripe.com/test/connect/accounts")}>
        Open Stripe Dashboard
      </Button>
    </div>
  );
}
