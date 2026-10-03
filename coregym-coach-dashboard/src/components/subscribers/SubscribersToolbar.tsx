"use client";

import * as React from "react";
import { Search, SearchX, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GlobalLink } from "@/components/shared/link";
import { EmptyState } from "@/components/core/EmptyState";
import { StatusBadge, statusTone } from "@/components/core/StatusBadge";

// Stitch "Clients" table: command bar (search field + server-rendered status
// chips) above the roster table. F-13: the search box is a GET form — the
// server filters the whole roster (any page, not just the loaded 25) and the
// term lives in the URL, so the pager/chips preserve it and a new search
// resets to page 1. Status chips + pager stay server links.

export type SubscriberRow = {
  /** SUBSCRIPTION id — row links keep /dashboard/subscribers/{subscriptionId}. */
  id: string;
  name: string;
  email: string;
  plan: string;
  status: string;
  statusLabel: string;
  avatarUrl: string | null;
  pastDue: boolean;
  /** Program & phase column (active program enrollment for this client). */
  programName: string | null;
  weekLabel: string | null;
  startLabel: string;
  adherence: number | null;
  /** Pre-localized check-in line ("Checked in {date}" / "No check-ins yet"). */
  checkInLabel: string;
  hasCheckIn: boolean;
};

export type ToolbarLabels = {
  searchPlaceholder: string;
  colClient: string;
  colProgram: string;
  colAdherence: string;
  colCheckIn: string;
  viewProfile: string;
  noProgram: string;
  filterEmpty: string;
  clearFilter: string;
  clearHref: string;
};

export function SubscribersToolbar({
  rows,
  labels,
  chips,
  pager,
  emptyAll,
  query = "",
  statusFilter = null,
  clearSearchHref = "/dashboard/subscribers",
}: {
  rows: SubscriberRow[];
  labels: ToolbarLabels;
  /** Server-rendered status filter chips (GlobalLink links with real counts). */
  chips: React.ReactNode;
  /** Server-rendered pagination footer (showing X–Y of Z + prev/next). */
  pager: React.ReactNode;
  /** Empty state for a roster with no rows at all (server-rendered). */
  emptyAll: React.ReactNode;
  /** F-13: the active server-side search term (from ?q=), driving the form. */
  query?: string;
  /** F-13: the active status filter, preserved by the search form's hidden field. */
  statusFilter?: string | null;
  /** F-13: href that clears the search but keeps the status filter (no page → page 1). */
  clearSearchHref?: string;
}) {
  // Server-side search: rows are already the filtered page; no client filter.
  // Submitting the form navigates with ?q= (plus the hidden ?status=) and
  // without ?page=, so every new search starts at page 1.
  const q = query.trim();

  return (
    <div className="flex flex-col gap-4">
      {/* Command bar: search + status chips */}
      <div className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-border lg:flex-row lg:items-center lg:justify-between">
        <form method="GET" action="/dashboard/subscribers" className="relative w-full max-w-xs" role="search">
          {/* Keep the active status filter when searching; ?page= is dropped → reset to 1. */}
          <input type="hidden" name="status" value={statusFilter ?? ""} />
          <Search className="absolute start-3 top-1/2 size-5 -translate-y-1/2 text-faint" />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={labels.searchPlaceholder}
            aria-label={labels.searchPlaceholder}
            className="h-10 ps-9 pe-9 text-body-md"
          />
          {q ? (
            <GlobalLink
              href={clearSearchHref}
              aria-label={labels.clearFilter}
              className="absolute end-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </GlobalLink>
          ) : (
            <button
              type="submit"
              aria-label={labels.searchPlaceholder}
              className="absolute end-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:bg-secondary hover:text-foreground"
            >
              <Search className="size-4" />
            </button>
          )}
        </form>
        <div className="flex flex-wrap items-center gap-2">{chips}</div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{labels.colClient}</TableHead>
                <TableHead>{labels.colProgram}</TableHead>
                <TableHead>{labels.colAdherence}</TableHead>
                <TableHead>{labels.colCheckIn}</TableHead>
                <TableHead className="text-end">{/* actions */}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={r.pastDue ? "bg-secondary/40" : undefined}>
                  {/* Identity: avatar + status dot + name + status chip + email • plan */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="relative shrink-0">
                        <Avatar className="size-10 rounded-lg">
                          {r.avatarUrl ? <AvatarImage src={r.avatarUrl} alt="" className="rounded-lg" /> : null}
                          <AvatarFallback className="rounded-lg text-label-md">
                            {r.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={`absolute bottom-0 end-0 size-3 rounded-full ring-2 ring-card ${
                            r.status === "active"
                              ? "bg-primary"
                              : r.status === "trialing"
                                ? "bg-mint"
                                : r.status === "past_due" || r.status === "cancelled" || r.status === "canceled"
                                  ? "bg-[#ea7a72]"
                                  : "bg-faint"
                          }`}
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-label-lg font-bold tracking-tight text-foreground">{r.name}</p>
                          <StatusBadge
                            tone={statusTone(r.status)}
                            className="text-[10px] font-bold uppercase tracking-wider"
                          >
                            {r.statusLabel}
                          </StatusBadge>
                        </div>
                        <p className="truncate text-body-sm text-faint">
                          {r.email}
                          {r.plan ? ` • ${r.plan}` : ""}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  {/* Program & phase */}
                  <TableCell>
                    {r.programName ? (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-label-md font-semibold text-foreground">{r.programName}</span>
                          {r.weekLabel && (
                            <span className="rounded bg-accent px-1.5 py-0.5 text-label-sm text-muted-foreground">
                              {r.weekLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-body-sm text-faint">{r.startLabel}</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-body-sm text-foreground">—</span>
                        <p className="text-body-sm text-faint">{labels.noProgram}</p>
                      </div>
                    )}
                  </TableCell>
                  {/* Adherence */}
                  <TableCell>
                    {r.adherence != null ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                          <div
                            className={`h-full rounded-full ${
                              r.adherence > 85 ? "bg-primary" : r.adherence >= 70 ? "bg-mint" : "bg-[#ea7a72]"
                            }`}
                            style={{ width: `${Math.min(100, r.adherence)}%` }}
                          />
                        </div>
                        <span className="text-body-sm font-semibold tabular-nums text-foreground">{r.adherence}%</span>
                      </div>
                    ) : (
                      <span className="text-body-sm text-faint">—</span>
                    )}
                  </TableCell>
                  {/* Check-in */}
                  <TableCell>
                    <span className={r.hasCheckIn ? "text-label-md text-foreground" : "text-body-sm text-faint"}>
                      {r.checkInLabel}
                    </span>
                  </TableCell>
                  {/* Actions */}
                  <TableCell className="text-end">
                    <GlobalLink href={`/dashboard/subscribers/${r.id}`}>
                      <Button variant="secondary" size="sm">
                        {labels.viewProfile}
                      </Button>
                    </GlobalLink>
                  </TableCell>
                </TableRow>
              ))}
              {/* F-13: an active search with no rows is a "no results" state
                  (offer clear-search); a bare empty roster gets emptyAll. */}
              {rows.length === 0 && q && (
                <TableRow>
                  <TableCell colSpan={5} className="p-4">
                    <EmptyState
                      icon={SearchX}
                      title={labels.filterEmpty}
                      action={
                        <GlobalLink href={clearSearchHref}>
                          <Button variant="secondary" size="sm">
                            {labels.clearFilter}
                          </Button>
                        </GlobalLink>
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.length === 0 && !q && (
                <TableRow>
                  <TableCell colSpan={5} className="p-4">
                    {emptyAll}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        {rows.length > 0 && pager}
      </Card>
    </div>
  );
}
