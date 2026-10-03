"use client";

/* Shared Google OAuth entry point for the auth pages (login + signup): the
   provider-availability probe (public /auth/v1/settings — no secrets involved)
   and the single signInWithOAuth call (PKCE via supabase-js, redirecting to
   /auth/callback) so both pages share one OAuth configuration. The callback
   route owns the code exchange, coach healing and footprint-based routing. */

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import type { TKey } from "@/lib/i18n/dictionary";
import { toast } from "sonner";

export function useGoogleAuth(failedToastKey: TKey) {
  const { t } = useI18n();
  const supabase = React.useMemo(() => createClient(), []);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [googleAvailable, setGoogleAvailable] = React.useState<boolean | null>(null); // null = probing

  // Only offer Google sign-in when the provider is enabled in Supabase Auth
  // (public settings endpoint — no secrets involved).
  React.useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
    })
      .then((r) => r.json())
      .then((j) => setGoogleAvailable(Boolean(j.external?.google)))
      .catch(() => setGoogleAvailable(false));
  }, []);

  async function startGoogle() {
    setGoogleLoading(true);
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthErr) throw oauthErr;
      // Browser redirects to Google; the callback completes sign-in.
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t(failedToastKey));
      setGoogleLoading(false);
    }
  }

  return { googleAvailable, googleLoading, startGoogle };
}
