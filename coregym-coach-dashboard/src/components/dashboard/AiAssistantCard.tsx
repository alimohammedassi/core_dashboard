"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Maximize2, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

export function AiAssistantCard({ onClick }: { onClick?: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const handleClick = onClick ?? (() => router.push("/dashboard/chat"));
  return (
    <Card className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] p-5 gap-4 shadow-none">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">{t("overview.ai.title")}</h3>
        <button onClick={handleClick} className="rounded p-1 hover:bg-[var(--surface-3)]" aria-label={t("overview.ai.expand")}>
          <Maximize2 className="size-3.5 text-[var(--text-muted)]" />
        </button>
      </div>

      <div className="flex flex-col items-center justify-center py-4">
        <button
          onClick={handleClick}
          className="relative flex size-20 items-center justify-center rounded-full bg-[var(--primary)] shadow-[0_0_30px_rgba(209,252,0,0.35)] animate-[pulseGlow_2.5s_ease-in-out_infinite]"
          aria-label={t("overview.ai.open")}
        >
          <span className="absolute inset-0 rounded-full bg-[var(--primary)] blur-xl opacity-30 animate-pulse" />
          <Sparkles className="relative size-8 text-black" />
        </button>
        <p className="mt-3 text-xs text-[var(--text-muted)] text-center max-w-[16ch]">
          {t("overview.ai.hint")}
        </p>
        {/* TODO: wire to existing AI route – e.g. /dashboard/ai or existing drawer handler. If none, this onClick opens a placeholder modal. */}
      </div>

      <style>{`@keyframes pulseGlow { 0%,100% { box-shadow: 0 0 20px rgba(209,252,0,0.35), 0 0 0 0 rgba(209,252,0,0.2); } 50% { box-shadow: 0 0 36px rgba(209,252,0,0.55), 0 0 0 12px rgba(209,252,0,0); } }`}</style>
    </Card>
  );
}
