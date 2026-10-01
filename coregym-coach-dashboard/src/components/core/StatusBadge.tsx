import { cn } from "cn";

/**
 * Stitch status chip: translucent tinted background + saturated text + matching
 * hairline border + status dot (DESIGN.md "Badges & Muscle Group Chips").
 * Semantic tones map to the data-viz palette; volt is reserved so row-level
 * chips never compete with primary CTAs.
 */
const TONES = {
  volt: "bg-primary/15 text-primary border-primary/30",
  emerald: "bg-[#36b37e]/15 text-[#36b37e] border-[#36b37e]/30",
  coral: "bg-[#ea7a72]/15 text-[#ea7a72] border-[#ea7a72]/30",
  amber: "bg-warning/15 text-warning border-warning/30",
  mint: "bg-[#68dfa6]/15 text-[#68dfa6] border-[#68dfa6]/30",
  neutral: "bg-secondary text-muted-foreground border-border",
} as const;

export type StatusTone = keyof typeof TONES;

export function StatusBadge({
  tone = "neutral",
  children,
  dot = true,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[6px] border px-2 text-[11px] font-semibold",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Map a raw subscription/payment status to the Stitch chip tone. */
export function statusTone(status: string | null | undefined): StatusTone {
  switch (status) {
    case "active":
    case "succeeded":
    case "paid":
      return "emerald";
    case "trialing":
    case "processing":
    case "in_transit":
      return "mint";
    case "past_due":
    case "pending":
      return "amber";
    case "cancelled":
    case "canceled":
    case "expired":
    case "failed":
      return "coral";
    default:
      return "neutral";
  }
}
