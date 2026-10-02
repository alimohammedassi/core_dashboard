"use client";

import * as React from "react";
import { Search, SearchX } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GlobalLink } from "@/components/shared/link";
import { EmptyState } from "@/components/core/EmptyState";
import { StatusBadge, statusTone } from "@/components/core/StatusBadge";

// Stitch "Clients" table: command bar (search field + server-rendered status
// chips) above the roster table. The search filters the bounded
// server-rendered page client-side (same idiom as TopClientsTable — no extra
// queries); status chips + pager stay server links so pagination state is
// preserved in the URL.

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
}: {
  rows: SubscriberRow[];
  labels: ToolbarLabels;
  /** Server-rendered status filter chips (GlobalLink links with real counts). */
  chips: React.ReactNode;
  /** Server-rendered pagination footer (showing X–Y of Z + prev/next). */
  pager: React.ReactNode;
  /** Empty state for a roster with no rows at all (server-rendered). */
  emptyAll: React.ReactNode;
}) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const visible = q
    ? rows.filter((r) => `${r.name} ${r.email} ${r.plan}`.toLowerCase().includes(q))
    : rows;

  return (
    <div className="flex flex-col gap-4">
      {/* Command bar: search + status chips */}
      <div className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-border lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-xs">
          <Search className="absolute start-3 top-1/2 size-5 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.searchPlaceholder}
            aria-label={labels.searchPlaceholder}
            className="h-10 ps-9 text-body-md"
          />
        </div>
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
              {visible.map((r) => (
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
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-4">
                    {emptyAll}
                  </TableCell>
                </TableRow>
              )}
              {rows.length > 0 && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-4">
                    <EmptyState
                      icon={SearchX}
                      title={labels.filterEmpty}
                      action={
                        <GlobalLink href={labels.clearHref}>
                          <Button variant="secondary" size="sm">
                            {labels.clearFilter}
                          </Button>
                        </GlobalLink>
                      }
                    />
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
