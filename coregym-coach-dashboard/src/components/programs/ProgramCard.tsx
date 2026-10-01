"use client";

import * as React from "react";
import { Activity, Dumbbell, Pencil, Trash2, UserPlus } from "lucide-react";
import { cn } from "cn";
import type { CoachProgram } from "@/lib/programs";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

// Weekday dictionary keys, indexed by day_of_week - 1 (1 = Monday … 7 = Sunday).
export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Stitch library card: icon tile + status chips header, a 7-slot week strip
 * (training day = template name, rest = dimmed "Rest"), and a footer with the
 * real active-athlete pill and explicit Edit / Enroll / Delete actions. */
export function ProgramCard({
  program,
  index,
  athletes,
  busy,
  onEdit,
  onEnroll,
  onDelete,
}: {
  program: CoachProgram;
  /** Position in the grid — alternates the icon tile volt/mint accent. */
  index: number;
  /** Active-athlete count for this program (from the server stats map). */
  athletes: number;
  busy: boolean;
  onEdit: () => void;
  onEnroll: () => void;
  onDelete: () => void;
}) {
  const { t, fmt } = useI18n();

  const byDay = new Map<number, string>();
  for (const d of program.days) byDay.set(d.day_of_week, d.templateName ?? "—");
  const Icon = index % 2 === 0 ? Dumbbell : Activity;

  return (
    <Card className="flex flex-col transition-colors hover:bg-secondary/60">
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent">
            <Icon className={cn("size-7", index % 2 === 0 ? "text-primary" : "text-mint")} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-headline-sm tracking-tight text-foreground">
              {program.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {program.is_active ? (
                <span className="rounded bg-primary/10 px-2 py-0.5 text-label-sm uppercase text-primary">
                  {t("programs.card.active")}
                </span>
              ) : (
                <span className="rounded bg-accent px-2 py-0.5 text-label-sm uppercase text-muted-foreground">
                  {t("programs.page.archived")}
                </span>
              )}
              <span className="rounded bg-accent px-2 py-0.5 text-label-sm text-muted-foreground">
                {t("programs.list.daysPerWeek", { n: fmt.num(program.days.length) })}
              </span>
            </div>
          </div>
        </div>

        {program.description && (
          <p className="line-clamp-2 text-body-sm text-faint">{program.description}</p>
        )}

        {/* Week strip: 7 fixed slots, template name per training day, dimmed
            rest slots for everything else. */}
        <div className="grid grid-cols-7 gap-1.5 pt-2">
          {WEEKDAY_KEYS.map((key, idx) => {
            const dow = idx + 1;
            const tplName = byDay.get(dow);
            const rest = !tplName;
            return (
              <div
                key={dow}
                title={rest ? t("programs.builder.rest") : tplName}
                className={cn(
                  "flex min-h-[92px] flex-col gap-1 rounded-lg p-2 text-start transition-colors",
                  rest ? "bg-background/30 opacity-75" : "bg-background/80 hover:bg-accent",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-label-sm uppercase", rest ? "text-faint" : "text-primary")}>
                    {t(`programs.weekdaysShort.${key}`)}
                  </span>
                  <span className="text-label-sm text-faint">{rest ? "--" : `D${dow}`}</span>
                </div>
                <p className={cn("line-clamp-2 text-label-md leading-tight", rest ? "text-muted-foreground" : "text-foreground")}>
                  {rest ? t("programs.builder.rest") : tplName}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>

      <CardFooter className="mt-auto flex-wrap justify-between gap-2 border-border/60 bg-secondary/40">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-label-sm text-foreground">
            <span className="size-2 rounded-full bg-primary" />
            {t("programs.list.athletesCount", { n: fmt.num(athletes) })}
          </span>
          <span className="text-body-sm text-faint">
            {t("programs.list.updated", { date: fmt.date(program.updated_at) })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" className="text-label-md" disabled={busy} onClick={onEdit}>
            <Pencil className="size-4" /> {t("common.actions.edit")}
          </Button>
          <Button size="sm" className="font-bold" disabled={busy} onClick={onEnroll}>
            <UserPlus className="size-4" /> {t("programs.list.enroll")}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ms-auto text-destructive hover:text-destructive"
            aria-label={t("common.actions.delete")}
            title={t("common.actions.delete")}
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
