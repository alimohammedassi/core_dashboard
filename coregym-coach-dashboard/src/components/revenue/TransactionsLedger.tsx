"use client";

import * as React from "react";
import { ReceiptText, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge, statusTone } from "@/components/core/StatusBadge";
import { Input } from "@/components/ui/input";
import { GlobalLink } from "@/components/shared/link";
import { cn } from "cn";
import { useI18n } from "@/lib/i18n/client";

// Client-side search over the CURRENT server page only (the full set stays
// server-paginated via ?page=). No extra queries are fired from here.

export interface LedgerRow {
  id: string;
  /** Display name resolved server-side (full_name → email → id slice). */
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  tier: string | null;
  grossLabel: string;
  feeLabel: string;
  /** True when the fee is the 15% estimate rather than a matched Stripe fee. */
  feeEst: boolean;
  netLabel: string;
  whenLabel: string;
  status: string | null;
  statusLabel: string;
}

export function TransactionsLedger({
  rows,
  total,
  page,
  totalPages,
  range,
}: {
  rows: LedgerRow[];
  /** Exact in-range row count (server count query). */
  total: number;
  page: number;
  totalPages: number;
  /** Active ?range= value, preserved across pagination links. */
  range: string;
}) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const visible = searching
    ? rows.filter((r) => [r.name, r.email, r.id].some((v) => v && v.toLowerCase().includes(q)))
    : rows;
  const anyEst = rows.some((r) => r.feeEst);

  const pageHref = (p: number) => `/dashboard/revenue?page=${p}&range=${encodeURIComponent(range)}`;

  return (
    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
      <div className="flex flex-col gap-3 p-5 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-headline-sm text-foreground">
            <ReceiptText className="size-5 text-primary" />
            {t("revenue.tx.title")}
          </h2>
          <p className="mt-0.5 text-body-sm text-faint">{t("revenue.tx.desc", { n: rows.length })}</p>
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("revenue.tx.searchPlaceholder")}
            aria-label={t("common.actions.search")}
            /* Stitch ledger filter: compact (~30px) with 13px body-sm text —
               the `!` beats the primitive's core text-base/md:text-sm. */
            className="rounded-lg bg-background ps-8 text-body-sm! md:text-body-sm!"
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-background/70 hover:bg-background/70">
            <TableHead>{t("revenue.tx.id")}</TableHead>
            <TableHead>{t("revenue.tx.athlete")}</TableHead>
            <TableHead>{t("revenue.tx.planTier")}</TableHead>
            <TableHead className="text-end">{t("revenue.tx.gross")}</TableHead>
            <TableHead className="text-end">{anyEst ? t("revenue.tx.feeEst") : t("revenue.tx.fee")}</TableHead>
            <TableHead className="text-end">{t("revenue.tx.net")}</TableHead>
            <TableHead>{t("revenue.tx.timestamp")}</TableHead>
            <TableHead>{t("common.table.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-body-sm text-faint">{r.id}</TableCell>
              <TableCell>
                <span className="flex items-center gap-2">
                  <Avatar size="sm" className="size-7">
                    {r.avatarUrl ? <AvatarImage src={r.avatarUrl} alt="" /> : null}
                    <AvatarFallback>{(r.name ?? "?").slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="max-w-[160px] truncate text-label-md font-semibold text-foreground">
                    {r.name ?? "—"}
                  </span>
                </span>
              </TableCell>
              <TableCell>
                {r.tier ? (
                  <span className="rounded bg-accent px-2 py-0.5 text-label-sm text-muted-foreground">{r.tier}</span>
                ) : (
                  <span className="text-body-sm text-faint">—</span>
                )}
              </TableCell>
              <TableCell className="text-end font-display text-headline-sm tabular-nums text-foreground">
                {r.grossLabel}
              </TableCell>
              <TableCell className="text-end text-body-md tabular-nums text-muted-foreground">
                {r.feeLabel}
                {r.feeEst && <span className="ms-1 text-label-sm text-faint">est.</span>}
              </TableCell>
              <TableCell className="text-end font-display text-headline-sm font-bold tabular-nums text-primary">
                {r.netLabel}
              </TableCell>
              <TableCell className="text-body-sm tabular-nums text-faint">{r.whenLabel}</TableCell>
              <TableCell>
                <StatusBadge tone={statusTone(r.status)}>{r.statusLabel}</StatusBadge>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-body-md text-muted-foreground">
                {t("revenue.tx.empty")}
              </TableCell>
            </TableRow>
          )}
          {rows.length > 0 && visible.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-body-md text-muted-foreground">
                {t("common.empty.searchNoResults")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-5 py-3">
        <p className={cn("text-body-sm text-muted-foreground")}>
          {searching
            ? t("revenue.tx.matches", { n: visible.length })
            : t("revenue.tx.showing", { shown: rows.length, total })}
        </p>
        {totalPages > 1 && !searching && (
          <nav className="flex items-center gap-2" aria-label={t("revenue.tx.title")}>
            {page > 1 ? (
              <GlobalLink href={pageHref(page - 1)} className="inline-flex h-8 items-center rounded-md border px-3 text-body-sm">
                {t("common.actions.previous")}
              </GlobalLink>
            ) : (
              <span className="inline-flex h-8 items-center rounded-md border px-3 text-body-sm opacity-40">
                {t("common.actions.previous")}
              </span>
            )}
            {page < totalPages ? (
              <GlobalLink href={pageHref(page + 1)} className="inline-flex h-8 items-center rounded-md border px-3 text-body-sm">
                {t("common.actions.next")}
              </GlobalLink>
            ) : (
              <span className="inline-flex h-8 items-center rounded-md border px-3 text-body-sm opacity-40">
                {t("common.actions.next")}
              </span>
            )}
          </nav>
        )}
      </div>
    </section>
  );
}
