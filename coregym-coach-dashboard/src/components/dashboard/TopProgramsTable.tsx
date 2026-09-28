"use client";

import { Card } from "@/components/ui/card";
import { Star, MoreHorizontal } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

export type ProgramRow = {
  id: string;
  name: string;
  thumb?: string;
  sessions: number;
  revenue: string;
  rating: number;
};

export function TopProgramsTable({ title, rows }: { title?: string; rows?: ProgramRow[] }) {
  const { t, fmt } = useI18n();
  const heading = title ?? t("overview.table.programsTitle");
  const hasData = rows && rows.length > 0;
  if (!hasData) {
    return (
      <Card className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] p-5 gap-0 shadow-none">
        <div className="flex items-center justify-between pb-4">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">{heading}</h3>
          <MoreHorizontal className="size-3.5 text-[var(--text-muted)]" />
        </div>
        <div className="flex h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] bg-[var(--surface-3)]/30">
          <p className="text-sm text-[var(--text-muted)]">{t("overview.table.programsEmpty")}</p>
          <p className="text-xs text-[var(--text-muted)]">{t("overview.table.programsEmptyHint")}</p>
        </div>
      </Card>
    );
  }
  const data = rows!;

  return (
    <Card className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] p-5 gap-0 shadow-none">
      <div className="flex items-center justify-between pb-4">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">{heading}</h3>
        <MoreHorizontal className="size-3.5 text-[var(--text-muted)]" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-start">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.06)] text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              <th className="pb-2 font-medium">{t("overview.table.id")}</th>
              <th className="pb-2 font-medium">{t("common.table.name")}</th>
              <th className="pb-2 font-medium text-right">{t("overview.table.booked")}</th>
              <th className="pb-2 font-medium text-right">{t("overview.table.revenue")}</th>
              <th className="pb-2 font-medium text-right">{t("overview.table.rating")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
            {data.map((r) => (
              <tr key={r.id} className="group hover:bg-[var(--surface-3)] transition-colors">
                <td className="py-3 text-xs font-mono text-[var(--text-muted)]">{r.id}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="size-6 rounded-md bg-[var(--surface-3)] flex items-center justify-center text-[10px]">◈</span>
                    <span className="text-sm text-white truncate max-w-[180px]">{r.name}</span>
                  </div>
                </td>
                <td className="py-3 text-right text-sm text-white">{fmt.num(r.sessions)}</td>
                <td className="py-3 text-right text-sm text-[var(--accent-cyan)]">{r.revenue}</td>
                <td className="py-3 text-right">
                  {r.rating > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--accent-gold)]">
                      <Star className="size-3 fill-[var(--accent-gold)] text-[var(--accent-gold)]" />
                      {fmt.num(r.rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
