"use client";

import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card } from "@/components/ui/card";
import { MoreHorizontal } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { TKey } from "@/lib/i18n/dictionary";

export type DayPoint = { day: string; value: number };

// lib/overview-style data sends English weekday abbreviations ("Mon".."Sun");
// map them to dictionary keys so labels follow the active language, passthrough
// anything else (same approach as overview/OverviewCharts.tsx).
const WEEKDAY_KEYS: Record<string, TKey> = {
  Mon: "overview.weekday.mon",
  Tue: "overview.weekday.tue",
  Wed: "overview.weekday.wed",
  Thu: "overview.weekday.thu",
  Fri: "overview.weekday.fri",
  Sat: "overview.weekday.sat",
  Sun: "overview.weekday.sun",
};

export function WeeklyActivityChart({ title, points }: { title?: string; points?: DayPoint[] }) {
  const { t, fmt } = useI18n();
  const heading = title ?? t("overview.activity.title");
  const localizeDay = (day: string) => (WEEKDAY_KEYS[day] ? t(WEEKDAY_KEYS[day]) : day);
  const hasData = points && points.length > 0 && points.some((p) => p.value > 0);
  if (!hasData) {
    return (
      <Card className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] p-5 gap-3 shadow-none">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">{heading}</h3>
          <MoreHorizontal className="size-3.5 text-[var(--text-muted)]" />
        </div>
        <div className="flex h-[160px] items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] bg-[var(--surface-3)]/30">
          <p className="text-sm text-[var(--text-muted)]">{t("overview.activity.empty")}</p>
        </div>
        <p className="text-xs text-[var(--text-muted)] text-center">{t("overview.activity.emptyHint")}</p>
      </Card>
    );
  }
  const data = points!;
  const max = Math.max(...data.map((d) => d.value));
  const maxDay = data.find((d) => d.value === max)?.day;

  return (
    <Card className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] p-5 gap-3 shadow-none">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">{heading}</h3>
        <MoreHorizontal className="size-3.5 text-[var(--text-muted)]" />
      </div>

      <div dir="ltr" className="h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.map((d) => ({ ...d, day: localizeDay(d.day) }))} barCategoryGap="18%">
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#6B6B6B", fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
              contentStyle={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#fff" }}
              labelStyle={{ color: "#A3A3A3" }}
              formatter={(v: unknown) => [fmt.num(Number(v ?? 0)), t("overview.activity.series")] as never}
            />
            <Bar dataKey="value" radius={[8, 8, 8, 8]} barSize={26}>
              {data.map((entry, idx) => (
                <Cell key={`c-${idx}`} fill={entry.day === maxDay ? "var(--primary)" : "var(--surface-3)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {maxDay && (
        <p className="text-center text-xs text-[var(--text-muted)]">
          {t("overview.activity.peakLabel")}: <span className="text-white font-medium">{localizeDay(maxDay)}</span> — {fmt.num(max)}
        </p>
      )}
    </Card>
  );
}
