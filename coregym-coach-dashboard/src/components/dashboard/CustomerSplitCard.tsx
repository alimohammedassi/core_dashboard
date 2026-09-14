"use client";

import { Card } from "@/components/ui/card";
import { Users, Clock, XCircle, MoreHorizontal } from "lucide-react";

export type SplitItem = { label: string; value: number; color: string; icon?: React.ComponentType<{ className?: string }> };

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Active: Users,
  "Past due": Clock,
  Cancelled: XCircle,
};

export function CustomerSplitCard({ title = "Clients breakdown", items }: { title?: string; items?: SplitItem[] }) {
  const hasData = items && items.length > 0 && items.some((i) => i.value > 0);
  if (!hasData) {
    return (
      <Card className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] p-5 gap-4 shadow-none">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">{title}</h3>
          <MoreHorizontal className="size-3.5 text-[var(--text-muted)]" />
        </div>
        <div className="flex h-[84px] items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] bg-[var(--surface-3)]/30">
          <p className="text-sm text-[var(--text-muted)]">No client breakdown yet</p>
        </div>
        <p className="text-xs text-[var(--text-muted)] text-center">Stats appear once you have subscriptions.</p>
      </Card>
    );
  }

  const data = items!;
  const total = data.reduce((s, i) => s + i.value, 0);

  return (
    <Card className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] p-5 gap-4 shadow-none">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">{title}</h3>
        <MoreHorizontal className="size-3.5 text-[var(--text-muted)]" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {data.map((it) => {
          const Icon = it.icon ?? ICON_MAP[it.label] ?? Users;
          return (
            <div key={it.label} className="space-y-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-[var(--surface-3)] text-[var(--text-secondary)]">
                <Icon className="size-3.5" />
              </span>
              <div className="text-xl font-bold text-white">{it.value}</div>
              <div className="text-xs text-[var(--text-muted)]">{it.label}</div>
            </div>
          );
        })}
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
        {data.map((it) => (
          <div key={it.label} style={{ width: `${(it.value / total) * 100}%`, background: it.color }} className="transition-all" />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-[var(--text-muted)]">
        {data.map((it) => (
          <span key={it.label}>
            {((it.value / total) * 100).toFixed(0)}% {it.label}
          </span>
        ))}
      </div>
    </Card>
  );
}
