"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
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

// ── Big chart: net revenue (or new subscribers fallback) per bucket ─────────
export function OverviewAreaChart({
  points,
  mode,
}: {
  points: { label: string; value: number }[];
  mode: "revenue" | "subscribers";
}) {
  const { t, fmt } = useI18n();
  const dense = points.length > 16;
  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="voltFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" {...tickProps(dense)} />
          <YAxis
            width={48}
            {...tickProps(false)}
            tickFormatter={(v: number) => (mode === "revenue" ? fmt.moneyShort(v / 100) : fmt.num(v))}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: "var(--border)" }}
            formatter={(v) => [
              mode === "revenue" ? fmt.moneyShort(Number(v) / 100) : t("overview.chart.subscriberCount", { n: Number(v) }),
              mode === "revenue" ? t("overview.chart.revenueSeries") : t("overview.chart.subscriberSeries"),
            ]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            strokeWidth={2.5}
            fill="url(#voltFill)"
            dot={false}
            activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--background)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Right column: Mon→Sun workout bars, peak day highlighted in lime ────────
export function WeekdayBarChart({ data, peakIndex }: { data: { day: string; count: number }[]; peakIndex: number }) {
  const { t, fmt } = useI18n();
  const localized = data.map((d) => ({ day: WEEKDAY_KEYS[d.day] ? t(WEEKDAY_KEYS[d.day]) : d.day, count: d.count }));
  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={localized} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="day" {...tickProps(false)} />
          <YAxis width={24} {...tickProps(false)} allowDecimals={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--accent)" }}
            formatter={(v) => [t("overview.chart.workoutCount", { n: Number(v) }), t("overview.chart.completedSeries")]}
          />
          <Bar dataKey="count" radius={[5, 5, 5, 5]} maxBarSize={26}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={i === peakIndex ? "var(--primary)" : "var(--secondary)"}
                fillOpacity={i === peakIndex ? 1 : 0.9}
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
  const size = 170;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const arc = Math.PI * r; // half-circle length
  const filled = rate == null ? 0 : (Math.min(100, Math.max(0, rate)) / 100) * arc;

  return (
    <div className="relative flex flex-col items-center">
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
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
      <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center">
        <span className="text-[34px] leading-none font-extrabold tracking-tight">
          {rate == null ? "—" : fmt.percent(rate)}
        </span>
      </div>
    </div>
  );
}
