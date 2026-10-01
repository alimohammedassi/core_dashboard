"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/lib/i18n/client";
import type { AiAnalysisMetrics } from "@/lib/ai/metrics";

// Compact Recharts visuals for the AI analysis card, driven by the same
// deterministic metrics as the chips. Handles empty data (explicit hint),
// single points, zero values and missing weeks — Recharts renders what
// exists; nothing is invented to fill gaps.

export function AiCharts({ metrics }: { metrics: AiAnalysisMetrics }) {
  const { t, fmt } = useI18n();

  const volume = metrics.workout.weekly_volume;
  const adherence = metrics.nutrition.weekly;

  if (volume.length === 0 && adherence.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("subscribers.ai.charts.empty")}</p>;
  }

  const volumeData = volume.map((w, i) => ({
    label: t("subscribers.ai.charts.weekShort", { n: i + 1 }),
    volume: w.volume,
  }));
  const adherenceData = adherence.map((w) => ({
    label: t("subscribers.ai.charts.weekShort", { n: w.week }),
    pct: w.pct ?? 0,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {volumeData.length > 0 && (
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-label-sm uppercase tracking-wider text-faint">
            {t("subscribers.ai.charts.weeklyVolume")}
          </p>
          {/* recharts SVGs are not RTL-aware */}
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={volumeData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(value) => [`${fmt.num(Number(value))} kg`, t("subscribers.ai.charts.weeklyVolume")]}
                />
                <Bar dataKey="volume" radius={[5, 5, 0, 0]} fill="var(--primary)" maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {adherenceData.length > 0 && (
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-label-sm uppercase tracking-wider text-faint">
            {t("subscribers.ai.charts.weeklyAdherence")}
          </p>
          {/* recharts SVGs are not RTL-aware */}
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={adherenceData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(value) => [`${fmt.num(Number(value))}%`, t("subscribers.ai.metrics.adherence")]}
                />
                <Bar dataKey="pct" radius={[5, 5, 0, 0]} fill="var(--teal)" maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
