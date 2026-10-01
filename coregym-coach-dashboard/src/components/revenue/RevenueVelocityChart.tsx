import { cn } from "cn";

// Stitch-exact weekly velocity bars — hand-rolled divs (no chart lib) so the
// server-rendered output never ships a client bundle. All values arrive
// pre-formatted from the server page; this component only lays them out.

export interface VelocityWeek {
  key: number;
  /** Localized x-axis label ("Sep 8"). */
  label: string;
  /** Net (after fees) cents for the week. */
  netCents: number;
  /** Platform-share cents for the week (real fee when live, 15% est. otherwise). */
  platformCents: number;
  /** Localized money label for the net value. */
  netLabel: string;
  /** True for the week containing "now" (visually emphasized). */
  current: boolean;
}

export function RevenueVelocityChart({
  weeks,
  title,
  subtitle,
  legendNet,
  legendPlatform,
  emptyLabel,
  footer,
}: {
  weeks: VelocityWeek[];
  title: string;
  subtitle: string;
  legendNet: string;
  legendPlatform: string;
  emptyLabel: string;
  /** Optional footer line (avg daily velocity + tx count), pre-formatted. */
  footer?: { avgDaily: string; txCount: string } | null;
}) {
  const maxTotal = Math.max(1, ...weeks.map((w) => w.netCents + w.platformCents));
  const hasData = weeks.some((w) => w.netCents + w.platformCents > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-headline-sm text-foreground">{title}</h2>
          <p className="mt-0.5 text-body-sm text-faint">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1.5 text-label-sm text-muted-foreground">
            <span className="size-3 rounded-sm bg-primary" />
            {legendNet}
          </span>
          <span className="flex items-center gap-1.5 text-label-sm text-muted-foreground">
            <span className="size-3 rounded-sm bg-border" />
            {legendPlatform}
          </span>
        </div>
      </div>

      {hasData ? (
        <div className="mt-4 flex flex-1 items-stretch gap-3 overflow-x-auto pb-1">
          {weeks.map((w) => {
            const total = w.netCents + w.platformCents;
            const totalPct = Math.round((total / maxTotal) * 100);
            const netPct = total > 0 ? Math.round((w.netCents / total) * 100) : 0;
            return (
              <div
                key={w.key}
                className={cn(
                  "flex min-w-[56px] flex-1 flex-col items-center gap-1.5 rounded-t-lg px-1 pt-1",
                  w.current && "bg-accent/60",
                )}
              >
                <span className="text-label-sm font-bold tabular-nums text-primary">{w.netLabel}</span>
                <div className="flex w-full max-w-[64px] flex-1 flex-col justify-end">
                  <div
                    className="flex w-full flex-col justify-end overflow-hidden rounded-t-sm"
                    style={{ height: `${Math.max(totalPct, 2)}%` }}
                    role="img"
                    aria-label={`${w.label}: ${w.netLabel}`}
                  >
                    {total > 0 ? (
                      <>
                        <div className="w-full bg-border" style={{ height: `${100 - netPct}%` }} />
                        <div className="w-full flex-1 bg-primary" style={{ height: `${netPct}%` }} />
                      </>
                    ) : (
                      <div className="h-px w-full bg-border/60" />
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    "whitespace-nowrap text-label-md",
                    w.current ? "font-bold text-foreground" : "text-faint",
                  )}
                >
                  {w.label}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center py-10 text-body-md text-muted-foreground">
          {emptyLabel}
        </div>
      )}

      {footer ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-body-sm text-muted-foreground">
          <span>{footer.avgDaily}</span>
          <span className="tabular-nums">{footer.txCount}</span>
        </div>
      ) : null}
    </div>
  );
}
