import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

/** Stitch-consistent empty state: dashed hairline card, icon in a graphite
 * chip, headline + hint, optional CTA. Server-safe. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-faint">
        <Icon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="font-display text-headline-sm text-foreground">{title}</p>
        {hint ? <p className="mx-auto max-w-sm text-body-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
