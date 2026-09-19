"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Collapsible section for long content: compact summary header always visible,
// detail content only rendered while open (conditional render — collapsed
// sections cost no DOM). Data remains bounded server-side; this only controls
// rendering, per the summary-first product direction.
export function CollapsibleSection({
  title,
  description,
  badge,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  /** Optional one-line summary shown while collapsed (e.g. key numbers). */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-start gap-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {title}
              {badge}
            </CardTitle>
            {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
            {!open && summary && <div className="mt-2 text-sm text-muted-foreground">{summary}</div>}
          </span>
          <span
            className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <ChevronDown className="size-4" />
          </span>
        </button>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}
