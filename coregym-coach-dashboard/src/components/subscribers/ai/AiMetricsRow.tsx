"use client";

import { Activity, Dumbbell, Scale, TrendingDown, TrendingUp, UtensilsCrossed, Minus } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { AiAnalysisMetrics } from "@/lib/ai/metrics";

// Deterministic headline metrics for the AI analysis card — computed from the
// same payload the model saw (src/lib/ai/metrics.ts), never from AI output.
// A chip without data renders an explicit "no data" state instead of a guess.

type ChipProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "up" | "down";
};

function MetricChip({ icon, label, value, sub, tone = "default" }: ChipProps) {
  const toneClass =
    tone === "up" ? "text-emerald-600" : tone === "down" ? "text-amber-600" : "text-foreground";
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`block text-base font-semibold leading-tight ${toneClass}`}>{value}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

export function AiMetricsRow({ metrics }: { metrics: AiAnalysisMetrics }) {
  const { t, fmt } = useI18n();
  const w = metrics.workout;
  const n = metrics.nutrition;
  const weight = metrics.weight;

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <MetricChip
        icon={<Dumbbell className="size-4" />}
        label={t("subscribers.ai.metrics.workoutCompletion")}
        value={w.completion_pct != null ? `${w.completion_pct}%` : t("subscribers.ai.metrics.noData")}
        sub={w.elapsed > 0 ? t("subscribers.ai.metrics.completedOf", { done: w.completed, total: w.elapsed }) : undefined}
      />
      <MetricChip
        icon={<UtensilsCrossed className="size-4" />}
        label={t("subscribers.ai.metrics.adherence")}
        value={n.overall.pct != null ? `${n.overall.pct}%` : t("subscribers.ai.metrics.noData")}
        sub={n.overall.planned > 0 ? t("subscribers.ai.metrics.completedOf", { done: n.overall.completed, total: n.overall.planned }) : undefined}
      />
      <MetricChip
        icon={<Activity className="size-4" />}
        label={t("subscribers.ai.metrics.sessionsLast30")}
        value={w.sessions_last_30 != null ? fmt.num(w.sessions_last_30) : t("subscribers.ai.metrics.noData")}
      />
      <MetricChip
        icon={<Scale className="size-4" />}
        label={t("subscribers.ai.metrics.weightTrend")}
        value={
          weight.trend_kg == null
            ? t("subscribers.ai.metrics.noData")
            : weight.trend_kg > 0
              ? t("subscribers.ai.metrics.trendGain", { kg: fmt.num(Math.abs(weight.trend_kg)) })
              : weight.trend_kg < 0
                ? t("subscribers.ai.metrics.trendLoss", { kg: fmt.num(Math.abs(weight.trend_kg)) })
                : t("subscribers.ai.metrics.trendStable")
        }
        sub={weight.latest_kg != null ? t("subscribers.ai.metrics.weightLatest", { kg: fmt.num(weight.latest_kg) }) : undefined}
        tone={weight.trend_kg == null || weight.trend_kg === 0 ? "default" : weight.trend_kg > 0 ? "up" : "down"}
      />
    </div>
  );
}

// Kept next to the chips: the trend direction glyph mirrors the numeric tone.
export function TrendGlyph({ trendKg }: { trendKg: number | null }) {
  if (trendKg == null || trendKg === 0) return <Minus className="size-3.5" />;
  return trendKg > 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />;
}
