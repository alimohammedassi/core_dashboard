import { cn } from "cn";

// Payout cards — real Stripe payouts only (payouts.list). Trace ids / batch
// chips are NOT rendered because payouts.list rows don't carry them.

export interface PayoutCardData {
  id: string;
  amountLabel: string;
  destinationLabel: string;
  statusLabel: string;
  status: string | null;
  /** "Standard" / "Instant" (localized) when the payout carries a method. */
  methodLabel: string | null;
  /** Localized "Settled {date}" / "Est. arrival {date}". */
  whenLabel: string;
}

function pillClasses(status: string | null): string {
  if (status === "pending" || status === "in_transit") return "bg-primary/15 text-primary";
  if (status === "paid") return "bg-mint/15 text-mint";
  return "bg-secondary text-muted-foreground";
}

export function PayoutCards({ payouts }: { payouts: PayoutCardData[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {payouts.map((p) => {
        const inFlight = p.status === "pending" || p.status === "in_transit";
        return (
          <div key={p.id} className="rounded-lg bg-background p-4 ring-1 ring-border">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-label-sm text-faint">{p.id}</span>
              <span
                className={cn(
                  "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-label-sm font-semibold",
                  pillClasses(p.status),
                )}
              >
                {inFlight && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
                {p.statusLabel}
              </span>
            </div>
            <p className="mt-3 font-display text-metric-display tabular-nums tracking-tight text-foreground">
              {p.amountLabel}
            </p>
            <p className="mt-1 text-body-sm text-muted-foreground">{p.destinationLabel}</p>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
              <span className="text-label-sm text-faint">{p.whenLabel}</span>
              {p.methodLabel ? (
                <span className="text-label-sm font-bold text-primary">{p.methodLabel}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
