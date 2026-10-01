import { cn } from "cn";
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";

/** Stitch telemetry metric card: uppercase micro-label + icon chip, a
 * metric-display readout with an optional trend pill, a footer row and an
 * optional hairline progress bar. Server-safe. */
export function StatCard({
  label,
  icon: Icon,
  value,
  trend,
  trendLabel,
  footer,
  progress,
  badge,
  valueClassName,
  className,
}: {
  label: React.ReactNode;
  icon?: LucideIcon;
  value: React.ReactNode;
  trend?: "up" | "down" | "flat";
  trendLabel?: React.ReactNode;
  footer?: React.ReactNode;
  /** 0–100 — renders the 1px volt progress rail under the footer. */
  progress?: number;
  /** Small chip rendered next to the label (e.g. "Realtime"). */
  badge?: React.ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-xl bg-card p-5 ring-1 ring-border transition-colors hover:bg-secondary/60",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-label-sm uppercase tracking-wider text-faint">{label}</span>
          {badge}
        </div>
        {Icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="my-3 flex flex-wrap items-baseline gap-2">
        <span className={cn("font-display text-metric-display tabular-nums tracking-tight text-foreground", valueClassName)}>
          {value}
        </span>
        {trendLabel ? (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-label-sm tabular-nums",
              trend === "down"
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/15 text-primary",
            )}
          >
            <TrendIcon className="size-3" />
            {trendLabel}
          </span>
        ) : null}
      </div>
      {footer ? (
        <div className="flex items-center justify-between gap-2 text-body-sm text-muted-foreground">
          {footer}
        </div>
      ) : null}
      {typeof progress === "number" ? (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Uppercase kicker pill used inside StatCard.label slot (e.g. "Realtime"). */
export function StatCardChip({ children, tone = "volt" }: { children: React.ReactNode; tone?: "volt" | "mint" | "neutral" }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-label-sm uppercase tracking-wide",
        tone === "volt" && "bg-primary/15 text-primary",
        tone === "mint" && "bg-[#68dfa6]/20 text-[#68dfa6]",
        tone === "neutral" && "bg-secondary text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
