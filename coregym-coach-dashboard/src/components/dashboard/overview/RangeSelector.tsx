"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { RANGE_OPTIONS, type RangeKey } from "@/lib/overview";
import { useI18n } from "@/lib/i18n/client";
import type { TKey } from "@/lib/i18n/dictionary";

// Localized labels for the range presets (RANGE_OPTIONS in lib/overview is
// English-only data used for the ?range= param values).
const RANGE_LABELS: Record<RangeKey, TKey> = {
  "30d": "overview.range.30d",
  month: "overview.range.month",
  "90d": "overview.range.90d",
};

// Month-range selector in the page-title row; drives all period-scoped stats
// through the ?range= query param. The trigger shows the resolved window
// ("Aug 16 – Sep 15 · Last 30 days" style), the menu lists the presets.
export function RangeSelector({ current, rangeLabel }: { current: RangeKey; rangeLabel: string }) {
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
        router.push(`/dashboard?${next.toString()}`);
      }}
    >
      <SelectTrigger
        aria-label={t("overview.range.aria")}
        className="h-9 rounded-full border-border bg-card ps-3 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <CalendarRange className="size-4 text-primary" />
          <span className="truncate">{rangeLabel}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {RANGE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {t(RANGE_LABELS[o.value])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
