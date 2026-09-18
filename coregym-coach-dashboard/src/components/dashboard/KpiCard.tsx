"use client";

import { cn } from "cn";
import { TrendingUp, TrendingDown, Users, CalendarCheck, DollarSign, UserPlus, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

const ICONS: Record<string, LucideIcon> = { Users, CalendarCheck, DollarSign, UserPlus };

export type KpiCardProps = {
  label: string;
  value: string | number;
  trend?: number; // percent, positive = up, negative = down
  trendLabel?: string;
  icon: string; // key into ICONS — string not component, so server can pass it
  iconBg?: string;
  className?: string;
};

export function KpiCard({ label, value, trend, trendLabel, icon, iconBg, className }: KpiCardProps) {
  const Icon = ICONS[icon] ?? Users;
  const isUp = trend !== undefined && trend >= 0;

  return (
    <Card
      className={cn(
        "rounded-2xl border border-border bg-card p-5 gap-3 shadow-none",
        "bg-[var(--surface-2)] border-[rgba(255,255,255,0.08)]",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-xs",
              iconBg ?? "bg-[var(--surface-3)] text-[var(--text-secondary)]"
            )}
          >
            <Icon className="size-3.5" />
          </span>
          <span className="text-sm font-medium text-[var(--text-secondary)]">{label}</span>
        </div>
        <span className="text-[11px] text-[var(--text-muted)]">
          <Icon className="size-3.5 opacity-0" />
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-bold leading-none tracking-tight text-[var(--text-primary)]">{value}</span>
        {trend !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
              isUp ? "bg-[rgba(34,197,94,0.12)] text-[var(--success)]" : "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]"
            )}
          >
            {isUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {isUp ? "+" : ""}
            {trend.toFixed(1)}%
          </span>
        )}
      </div>

      {trendLabel && <p className="text-xs text-[var(--text-muted)]">{trendLabel}</p>}
    </Card>
  );
}
