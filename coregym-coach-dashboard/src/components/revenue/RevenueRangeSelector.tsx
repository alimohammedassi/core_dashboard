"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n/client";
import type { TKey } from "@/lib/i18n/dictionary";

// Revenue-local date-range presets (?range=30d|90d|all). Kept separate from
// the overview RangeSelector because the preset list differs ("all" here, no
// "month") while the URL-driven Select pattern is the same. The range type +
// resolver live in lib/revenue-range.ts (server-safe — the page imports them).
import { REV_RANGES, type RevRange } from "@/lib/revenue-range";

const RANGE_LABELS: Record<RevRange, TKey> = {
  "30d": "revenue.range.30d",
  "90d": "revenue.range.90d",
  all: "revenue.range.all",
};

export function RevenueRangeSelector({ current, rangeLabel }: { current: RevRange; rangeLabel: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();

  return (
    <Select
      value={current}
      onValueChange={(v) => {
        if (!v || v === current) return;
        const next = new URLSearchParams(params.toString());
        next.set("range", v);
        next.delete("page");
        router.push(`/dashboard/revenue?${next.toString()}`);
      }}
    >
      <SelectTrigger
        aria-label={t("revenue.range.aria")}
        /* Stitch date selector: label-md (12/600) — `!` beats the primitive's
           core text-sm. */
        className="h-9 rounded-full border-border bg-card ps-3 text-label-md! font-semibold"
      >
        <span className="flex items-center gap-2">
          <CalendarRange className="size-4 text-primary" />
          <span className="truncate">{rangeLabel}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {REV_RANGES.map((o) => (
          <SelectItem key={o} value={o}>
            {t(RANGE_LABELS[o])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
