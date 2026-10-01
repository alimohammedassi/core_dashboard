"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/lib/i18n/client";
import type { TKey } from "@/lib/i18n/dictionary";

// Shared Recharts chrome — theme-token driven so both modes render correctly.
const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--popover-foreground)",
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
} as const;

function tickProps(dense: boolean) {
  return {
    fill: "var(--muted-foreground)",
    fontSize: 10,
    tickLine: false,
    axisLine: false,
    interval: dense ? 6 : 0,
  };
}

// lib/overview sends English weekday abbreviations ("Mon".."Sun"); map them to
// dictionary keys so the axis follows the active language, passthrough unknown.
const WEEKDAY_KEYS: Record<string, TKey> = {
  Mon: "overview.weekday.mon",
  Tue: "overview.weekday.tue",
  Wed: "overview.weekday.wed",
  Thu: "overview.weekday.thu",
  Fri: "overview.weekday.fri",
  Sat: "overview.weekday.sat",
  Sun: "overview.weekday.sun",
};

// ── Stitch "Revenue & Growth Velocity" chart ─────────────────────────────────
// Smooth volt line, subtle gradient fill, circular data points, hairline
// horizontal grid, and a volt callout on the latest value. Mode toggle
// (Revenue / Subscribers) switches between two real series client-side.
export function RevenueGrowthChart({
  revenue,
  subscribers,
  defaultMode,
  totalCents,
  peakWeeklyNetCents,
  projectedMrrCents,
}: {
  revenue: { label: string; value: number }[];
  subscribers: { label: string; value: number }[];
  defaultMode: "revenue" | "subscribers";
  totalCents: number;
  peakWeeklyNetCents: number;
  projectedMrrCents: number;
}) {
  const { t, fmt } = useI18n();
  const [mode, setMode] = React.useState<"revenue" | "subscribers">(defaultMode);
  const points = mode === "revenue" ? revenue : subscribers;
  const dense = points.length > 8;
  const isMoney = mode === "revenue";
  const last = points[points.length - 1];

  return (
    <div className="flex flex-col gap-4">
      {/* Stitch card header: title left, segmented toggle right */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-label-sm uppercase tracking-wider text-faint">{t("overview.kpi.netRevenue")}</p>
          <h3 className="font-display text-headline-md text-foreground">{t("overview.chart.revenueTitle")}</h3>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
          {(["revenue", "subscribers"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 text-label-md transition-colors ${
                mode === m ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "revenue" ? t("overview.chart.revenueToggle") : t("overview.chart.subscribersToggle")}
            </button>
          ))}
        </div>
      </div>

      {/* Stitch metrics row — all three derived from real payment data */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <p className="text-label-sm uppercase tracking-wider text-faint">{t("overview.chart.totalPeriod")}</p>
          <p className="font-display text-[26px] font-bold tabular-nums tracking-tight text-primary">
            {fmt.moneyShort(totalCents / 100)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-label-sm uppercase tracking-wider text-faint">{t("overview.chart.peakWeekly")}</p>
          <p className="font-display text-[26px] font-bold tabular-nums tracking-tight text-foreground">
            {fmt.moneyShort(peakWeeklyNetCents / 100)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-label-sm uppercase tracking-wider text-faint">{t("overview.chart.projectedMrr")}</p>
          <p className="font-display text-[26px] font-bold tabular-nums tracking-tight text-[#68dfa6]">
            {fmt.moneyShort(projectedMrrCents / 100)}
          </p>
        </div>
      </div>

      <div dir="ltr">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={points} margin={{ top: 24, right: 56, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="voltFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeWidth={1} vertical={false} opacity={0.6} />
            <XAxis
              dataKey="label"
              {...tickProps(dense)}
              tickFormatter={(v: string) => v.replace(" ", " ")}
            />
            <YAxis
              width={48}
              {...tickProps(false)}
              tickFormatter={(v: number) => (isMoney ? fmt.moneyShort(v / 100) : fmt.num(v))}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ stroke: "var(--border)" }}
              formatter={(v) => [
                isMoney ? fmt.moneyShort(Number(v) / 100) : t("overview.chart.subscriberCount", { n: Number(v) }),
                isMoney ? t("overview.chart.revenueSeries") : t("overview.chart.subscriberSeries"),
              ]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--primary)"
              strokeWidth={2.5}
              fill="url(#voltFill)"
              dot={{ r: 3.5, fill: "var(--primary)", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "var(--primary)", stroke: "var(--background)", strokeWidth: 2 }}
            />
            {last && (
              <ReferenceDot
                x={last.label}
                y={last.value}
                r={5}
                fill="var(--primary)"
                stroke="var(--background)"
                strokeWidth={2}
                label={{
                  value: isMoney ? fmt.moneyShort(last.value / 100) : String(last.value),
                  position: "top",
                  fill: "var(--primary)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Right column: Mon→Sun workout bars, peak day in lime, values above bars ──
export function WeekdayBarChart({ data, peakIndex }: { data: { day: string; count: number }[]; peakIndex: number }) {
  const { t } = useI18n();
  const localized = data.map((d) => ({ day: WEEKDAY_KEYS[d.day] ? t(WEEKDAY_KEYS[d.day]) : d.day, count: d.count }));
  return (
    <div className="flex flex-col gap-2" dir="ltr">
      {/* Peak Load / Standard legend (Stitch) */}
      <div className="flex items-center justify-end gap-4 text-label-md text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-primary" />
          {t("overview.chart.peakLoad")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-secondary" />
          {t("overview.chart.standard")}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={localized} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeWidth={1} vertical={false} opacity={0.4} />
          <XAxis dataKey="day" {...tickProps(false)} />
          <YAxis width={24} {...tickProps(false)} allowDecimals={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--accent)" }}
            formatter={(v) => [t("overview.chart.workoutCount", { n: Number(v) }), t("overview.chart.completedSeries")]}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={44}>
            <LabelList
              dataKey="count"
              position="top"
              style={{ fill: "var(--muted-foreground)", fontSize: 11, fontWeight: 600 }}
            />
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={i === peakIndex && data[i].count > 0 ? "var(--primary)" : "#343531"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Right column: goal-adherence gauge (semicircular arc, lime gradient) ────
export function AdherenceGauge({ rate }: { rate: number | null }) {
  const { fmt } = useI18n();
  const size = 210;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const arc = Math.PI * r; // half-circle length
  const filled = rate == null ? 0 : (Math.min(100, Math.max(0, rate)) / 100) * arc;

  return (
    <div className="relative flex flex-col items-center">
      <svg width={size} height={size / 2 + 18} viewBox={`0 0 ${size} ${size / 2 + 18}`}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--volt)" />
          </linearGradient>
        </defs>
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {filled > 0 && (
          <path
            d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${arc}`}
          />
        )}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[42%] text-center">
        <span className="font-display text-[44px] leading-none font-bold tracking-tight tabular-nums text-foreground">
          {rate == null ? "—" : fmt.percent(rate)}
        </span>
      </div>
    </div>
  );
}

// Keep the legacy export name working for any existing imports.
export const OverviewAreaChart = RevenueGrowthChart;
