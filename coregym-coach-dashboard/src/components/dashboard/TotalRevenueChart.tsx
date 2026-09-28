"use client";

import * as React from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line } from "recharts";
import { Card } from "@/components/ui/card";
import { MoreHorizontal } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

export type RevenuePoint = { date: string; value: number; compare?: number };

export function TotalRevenueChart({
  title,
  value,
  trend,
  points,
}: {
  title?: string;
  value?: string;
  trend?: number | null;
  points?: RevenuePoint[];
}) {
  const { t, fmt } = useI18n();
  const heading = title ?? t("overview.revenue.title");
  const data = points;
  const hasData = data && data.length > 0 && data.some((d) => d.value > 0);

  return (
    <Card className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] p-5 gap-4 shadow-none">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-[var(--text-secondary)]">{heading}</h3>
            <button className="rounded p-1 hover:bg-[var(--surface-3)]">
              <MoreHorizontal className="size-3.5 text-[var(--text-muted)]" />
            </button>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{value ?? fmt.moneyShort(0)}</span>
            {trend !== null && trend !== undefined && (
              <span
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium ${trend >= 0 ? "bg-[rgba(34,197,94,0.12)] text-[var(--success)]" : "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]"}`}
              >
                {trend >= 0 ? "▲" : "▼"} {fmt.percent(Math.abs(trend))}
              </span>
            )}
            <span className="text-xs text-[var(--text-muted)]">
              {trend !== null && trend !== undefined ? t("overview.revenue.vsLastPeriod") : t("overview.revenue.noPrevious")}
            </span>
          </div>
        </div>
      </div>

      {hasData ? (
        <div dir="ltr" className="h-[140px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#6B6B6B", fontSize: 11 }} dy={6} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#6B6B6B", fontSize: 11 }} width={48} tickFormatter={(v: number) => fmt.moneyShort(v)} />
              <Tooltip
                contentStyle={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#fff" }}
                labelStyle={{ color: "#A3A3A3" }}
                formatter={(value: unknown, name: unknown) => [fmt.moneyShort(Number(value ?? 0)), String(name) === "value" ? heading : t("overview.revenue.previous")] as never}
              />
              <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="compare" stroke="#6B6B6B" strokeWidth={1.2} strokeDasharray="6 4" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[140px] items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] bg-[var(--surface-3)]/30">
          <p className="text-sm text-[var(--text-muted)]">{t("overview.revenue.empty")}</p>
        </div>
      )}
    </Card>
  );
}
