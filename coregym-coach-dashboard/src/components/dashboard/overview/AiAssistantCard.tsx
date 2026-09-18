"use client";

import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Decorative AI orb + honest placeholder action — the real assistant is a
// later deep-link; clicking never fabricates an answer.
export function AiAssistantCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 size-36 rounded-full opacity-60 blur-2xl"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, var(--volt) 0%, transparent 55%), radial-gradient(circle at 70% 65%, var(--teal) 0%, transparent 50%), radial-gradient(circle at 55% 30%, var(--gold) 0%, transparent 45%)",
        }}
      />
      <div
        aria-hidden
        className="relative mx-auto size-20 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 32% 28%, var(--volt) 0%, var(--teal) 38%, var(--gold) 68%, var(--card) 100%)",
          boxShadow: "0 0 32px 2px color-mix(in srgb, var(--volt) 35%, transparent)",
        }}
      />
      <div className="relative mt-4 text-center">
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" /> AI Assistant
        </p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          Ask questions about your clients&apos; activity and progress.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 rounded-full"
          onClick={() => toast.info("AI assistant is coming soon — it will deep-link to Supabase AI.")}
        >
          Ask about your clients
        </Button>
      </div>
    </div>
  );
}
