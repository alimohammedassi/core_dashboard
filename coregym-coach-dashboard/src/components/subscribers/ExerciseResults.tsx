"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/lib/i18n/client";

// "Exercise Results" visual for the customer profile: working-set volume per
// session (bars) + weight progression for the top exercises (lines).
// Server component computes the data; this renders it.

export type SessionVolumePoint = { date: string; label: string; volume: number };
export type ExerciseProgression = { name: string; points: { date: string; weight: number }[] };

const LINE_COLORS = ["var(--primary)", "var(--teal)", "var(--gold)"];

export function ExerciseResults({
  sessionVolume,
  exercises,
}: {
  sessionVolume: SessionVolumePoint[];
  exercises: ExerciseProgression[];
}) {
  const { t, fmt } = useI18n();
  const hasVolume = sessionVolume.length > 0;
  const hasProgression = exercises.length > 0;

  if (!hasVolume && !hasProgression) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {t("subscribers.exerciseResults.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {hasVolume && (
        <div>
          <p className="mb-2 text-label-sm uppercase tracking-wider text-faint">
            {t("subscribers.exerciseResults.volumeTitle")}
          </p>
          {/* recharts SVGs are not RTL-aware */}
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={sessionVolume} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
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
                  formatter={(value) => [`${fmt.num(Number(value))} kg`, t("subscribers.exerciseResults.volumeSeries")]}
                />
                <Bar dataKey="volume" radius={[6, 6, 0, 0]} fill="var(--primary)" maxBarSize={38}>
                  {sessionVolume.map((point, i) => (
                    <Cell key={point.date} fill={i === sessionVolume.length - 1 ? "var(--volt)" : "var(--primary)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasProgression && (
        <div>
          <p className="mb-2 text-label-sm uppercase tracking-wider text-faint">
            {t("subscribers.exerciseResults.weightTitle")}
          </p>
          {/* recharts SVGs are not RTL-aware */}
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={190}>
              <LineChart margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  type="category"
                  allowDuplicatedCategory={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
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
                  formatter={(value) => [`${fmt.num(Number(value))} kg`, t("subscribers.exerciseResults.weightSeries")]}
                />
                {exercises.map((ex, i) => (
                  <Line
                    key={ex.name}
                    data={ex.points}
                    dataKey="weight"
                    name={ex.name}
                    type="monotone"
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
            {exercises.map((ex, i) => (
              <span key={ex.name} className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-label-md text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
                {ex.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
