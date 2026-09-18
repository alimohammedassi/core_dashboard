"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { RANGE_OPTIONS, type RangeKey } from "@/lib/overview";

// Month-range selector in the page-title row; drives all period-scoped stats
// through the ?range= query param. The trigger shows the resolved window
// ("Aug 16 – Sep 15 · Last 30 days" style), the menu lists the presets.
export function RangeSelector({ current, rangeLabel }: { current: RangeKey; rangeLabel: string }) {
  const router = useRouter();
  const params = useSearchParams();

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
        aria-label="Stats period"
        className="h-9 rounded-full border-border bg-card pl-3 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <CalendarRange className="size-4 text-primary" />
          <span className="truncate">{rangeLabel}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {RANGE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
