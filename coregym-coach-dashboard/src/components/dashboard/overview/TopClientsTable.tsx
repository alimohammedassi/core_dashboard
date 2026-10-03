"use client";

import * as React from "react";
import { Download, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { GlobalLink } from "@/components/shared/link";
import { Button } from "@/components/ui/button";
import { StatusBadge, statusTone } from "@/components/core/StatusBadge";
import { useI18n } from "@/lib/i18n/client";

export type TopClientRow = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  plan: string | null;
  status: string;
  startDate: string;
  adherencePct: number | null;
  lastCheckIn: string | null;
};

/**
 * Stitch "Top Active Clients" — filter field, avatar + name/email, plan,
 * adherence progress bar, last check-in, status chip, View Profile action.
 * Filters the bounded server-rendered set client-side (no extra queries).
 */
export function TopClientsTable({
  rows,
  totalActive,
  fmtDate,
}: {
  rows: TopClientRow[];
  totalActive: number;
  fmtDate: Record<string, string>; // ISO date -> localized short date
}) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const visible = q
    ? rows.filter((r) => `${r.name} ${r.email ?? ""} ${r.plan ?? ""}`.toLowerCase().includes(q))
    : rows;

  return (
    <div className="flex flex-col gap-3">
      {/* toolbar: filter field + Export CSV */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("overview.table.filterRoster")}
            aria-label={t("overview.table.filterRoster")}
            className="h-9 ps-9"
          />
        </div>
        <Button render={<a href="/api/export/subscribers" download />} variant="secondary" size="sm">
          <Download className="me-1 size-3.5" /> {t("overview.table.exportCsv")}
        </Button>
      </div>

      <Table rows={visible} fmtDate={fmtDate} />

      {/* footer: real counts + real navigation (no fake pager) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-1 pt-3">
        <p className="text-body-sm text-faint">
          {t("overview.table.footer", { shown: visible.length, total: totalActive })}
        </p>
        <GlobalLink
          href="/dashboard/subscribers"
          className="text-label-md text-primary underline-offset-4 hover:underline"
        >
          {t("common.actions.viewAll")}
        </GlobalLink>
      </div>
    </div>
  );
}

function Table({ rows, fmtDate }: { rows: TopClientRow[]; fmtDate: Record<string, string> }) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-start text-sm" data-slot="overview-clients-table">
        <thead>
          <tr className="border-b border-border/60">
            {[
              t("overview.table.client"),
              t("subscribers.detail.plan"),
              t("overview.table.adherence"),
              t("overview.table.lastCheckIn"),
              t("common.table.status"),
              "",
            ].map((h, i) => (
              <th
                key={i}
                className="px-3 py-2.5 text-start text-label-sm font-semibold uppercase tracking-wider text-faint last:text-end"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40">
              {/* identity */}
              <td className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="relative shrink-0">
                    <Avatar className="size-9">
                      {r.avatarUrl ? <AvatarImage src={r.avatarUrl} alt="" /> : null}
                      <AvatarFallback className="text-xs">{(r.name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute bottom-0 end-0 size-2 rounded-full ring-2 ring-card ${
                        r.status === "active" ? "bg-primary" : r.status === "trialing" ? "bg-[#68dfa6]" : "bg-[#ea7a72]"
                      }`}
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-body-md font-semibold text-foreground">{r.name}</p>
                    {r.email && <p className="truncate text-body-sm text-faint">{r.email}</p>}
                  </div>
                </div>
              </td>
              {/* plan (honest fallback while the plans RLS fix is pending) */}
              <td className="px-3 py-3 text-body-sm text-muted-foreground">{r.plan ?? "—"}</td>
              {/* adherence bar + pct */}
              <td className="px-3 py-3">
                {r.adherencePct != null ? (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full ${r.adherencePct > 85 ? "bg-primary" : r.adherencePct >= 70 ? "bg-[#68dfa6]" : "bg-[#ea7a72]"}`}
                        style={{ width: `${Math.min(100, r.adherencePct)}%` }}
                      />
                    </div>
                    <span className="text-body-sm font-semibold tabular-nums text-foreground">{r.adherencePct}%</span>
                  </div>
                ) : (
                  <span className="text-body-sm text-faint">—</span>
                )}
              </td>
              {/* last check-in */}
              <td className="px-3 py-3 text-body-sm text-muted-foreground">
                {r.lastCheckIn ? fmtDate[r.lastCheckIn] ?? r.lastCheckIn : "—"}
              </td>
              {/* status chip */}
              <td className="px-3 py-3">
                <StatusBadge tone={statusTone(r.status)}>{r.status === "active" ? t("overview.status.active") : r.status}</StatusBadge>
              </td>
              {/* action */}
              <td className="px-3 py-3 text-end">
                <GlobalLink
                  href={`/dashboard/subscribers/${r.id}`}
                  className="inline-flex h-8 items-center rounded-lg border border-border bg-secondary px-3 text-label-md text-foreground transition-colors hover:bg-accent"
                >
                  {t("overview.table.viewProfile")}
                </GlobalLink>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-body-md text-muted-foreground">
                {t("overview.table.filterEmpty")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
