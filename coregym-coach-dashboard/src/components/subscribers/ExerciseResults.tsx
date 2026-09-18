"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
  const hasVolume = sessionVolume.length > 0;
  const hasProgression = exercises.length > 0;

  if (!hasVolume && !hasProgression) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No workout results yet — charts appear once the client logs sets in the app.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {hasVolume && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Volume per session (kg)
          </p>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={sessionVolume} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(value) => [`${Number(value).toLocaleString("en-US")} kg`, "Volume"]}
              />
              <Bar dataKey="volume" radius={[6, 6, 0, 0]} fill="var(--primary)" maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasProgression && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Weight progression — top exercises (kg)
          </p>
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
                  borderRadius: 10,
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(value) => [`${Number(value)} kg`, "Weight"]}
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
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
            {exercises.map((ex, i) => (
              <span key={ex.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
