"use client";

/* Panel-scoped loading overlay for cards/lists whose contents are temporarily
   unusable while loading. The parent must establish the positioning context
   (className "relative") — the overlay only ever covers its own panel.

   Fast requests never flash it: useDelayedFlag holds the overlay invisible
   (and pointer-transparent) for `delayMs`, then reveals it if still loading.
   When loading ends the overlay unmounts immediately. */

import * as React from "react";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/client";
import { cn } from "cn";

/** True only once `active` has held continuously for `ms`. */
export function useDelayedFlag(active: boolean, ms = 300): boolean {
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    // Both transitions go through the timeout (hide at 0ms) so no setState
    // runs synchronously inside the effect; the pending timer is cleared on
    // every dep change/unmount, so state never updates after unmount.
    const id = window.setTimeout(() => setSettled(active), active ? ms : 0);
    return () => window.clearTimeout(id);
  }, [active, ms]);
  return settled;
}

export function LoadingOverlay({
  label,
  active = true,
  delayMs = 300,
  className,
}: {
  /** Optional visible label; defaults to a screen-reader-only localized "Loading…". */
  label?: string;
  active?: boolean;
  delayMs?: number;
  className?: string;
}) {
  const t = useT();
  const show = useDelayedFlag(active, delayMs);
  if (!active) return null;
  return (
    <div
      role="status"
      className={cn(
        "absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[inherit] bg-background/70 backdrop-blur-sm",
        show ? "opacity-100" : "pointer-events-none opacity-0",
        className
      )}
    >
      <Spinner size="lg" />
      {label ? (
        <p className="text-sm text-muted-foreground">{label}</p>
      ) : (
        <span className="sr-only">{t("common.state.loading")}</span>
      )}
    </div>
  );
}
