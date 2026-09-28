"use client";

import { CalendarDays } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

export function PageHeader({ title }: { title?: string }) {
  const { t, fmt } = useI18n();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const range = `${fmt.date(monthStart)} – ${fmt.date(monthEnd)}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold tracking-tight text-white md:text-2xl">{title ?? t("overview.pageTitle")}</h1>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] px-3 py-1 text-xs text-[var(--text-secondary)]">
          <CalendarDays className="size-3.5 text-[var(--text-muted)]" />
          {range}
        </span>
        <span className="inline-flex h-7 items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] px-3 text-xs text-[var(--text-muted)]">
          {t("overview.realDataOnly")}
        </span>
      </div>
    </div>
  );
}
