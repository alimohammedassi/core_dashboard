"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "cn";

type Hit = {
  id: string; // subscription id — profile pages are keyed by subscription
  name: string;
  email: string | null;
  plan: string | null;
  status: string;
};

// Top-bar "Search clients…" — live-searches the coach's subscribers via
// /api/coach/clients/search and navigates to their profile page.
export function ClientSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  function onQueryChange(value: string) {
    setQ(value);
    // Reset the result list eagerly for short input (setState belongs in the
    // handler; the effect only runs the debounced fetch).
    if (value.trim().length < 2) {
      setHits([]);
      setLoading(false);
      setOpen(false);
    }
  }

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/coach/clients/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as { results?: Hit[] };
        setHits(data.results ?? []);
        setOpen(true);
      } catch {
        /* aborted or offline — keep previous state */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function go(hit: Hit) {
    setOpen(false);
    setQ("");
    router.push(`/dashboard/subscribers/${hit.id}`);
  }

  return (
    <div ref={boxRef} className={cn("relative min-w-0 flex-1 md:max-w-sm", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => q.trim().length >= 2 && setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Search clients…"
        aria-label="Search clients"
        className="h-9 w-full rounded-full border border-border bg-muted/60 pr-9 pl-9 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card focus:ring-2 focus:ring-ring/30"
      />
      {loading && (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open && (
        <div className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-popover shadow-lg shadow-black/10">
          {hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {q.trim().length < 2 ? "Type at least 2 characters" : "No subscribers match your search"}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => go(hit)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback>{hit.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{hit.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {hit.email ?? "—"}
                        {hit.plan ? ` · ${hit.plan}` : ""}
                      </span>
                    </span>
                    <span className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                      {hit.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
