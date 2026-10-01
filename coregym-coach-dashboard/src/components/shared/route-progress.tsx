"use client";

/* Global route-change indicator. Rendered as a child of GlobalLink so it can
   read that specific Link's pending state via useLinkStatus() — only the
   clicked link's instance exists, so one navigation never shows two bars.

   The element is always mounted and toggled via data-pending: the show-delay
   (150ms) lives in CSS as a transition-delay on the pending state, so instant
   navigations never flash the bar and there are no timers to clean up. The
   idle state has no transition, so hiding is immediate. Animation, RTL
   reversal and reduced-motion behavior live in globals.css. */

import { useLinkStatus } from "next/link";
import { useT } from "@/lib/i18n/client";

export function RouteProgress() {
  const { pending } = useLinkStatus();
  const t = useT();

  return (
    <div
      role="progressbar"
      aria-label={t("common.state.loading")}
      data-pending={pending ? "true" : "false"}
      // Idle bar is fully hidden (CSS visibility + aria) so screen readers
      // never see a stack of silent progressbars.
      aria-hidden={pending ? undefined : true}
      className="route-progress-bar"
    />
  );
}
