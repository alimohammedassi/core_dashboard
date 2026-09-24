"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeeklyNutrition } from "@/lib/nutrition";

// Nutrition trends for one enrollment: prescribed vs current calories,
// actual macros, and adherence per week. Sibling of ExerciseResults — same
// container expectations, same axis/tooltip styling, same empty-state voice.

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--popover-foreground)",
  fontSize: 12,
};

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };

export function NutritionTrends({ weekly }: { weekly: WeeklyNutrition[] }) {
  const calories = weekly.map((w) => ({
    week: `W${w.week}`,
    Prescribed: Math.round(w.prescribed.calories),
    Actual: Math.round(w.current.calories),
  }));
  const macros = weekly.map((w) => ({
    week: `W${w.week}`,
    Protein: w.current.protein_g,
    Carbs: w.current.carbs_g,
    Fat: w.current.fat_g,
  }));
  const adherence = weekly.map((w) => ({
    week: `W${w.week}`,
    Adherence: w.pct,
  }));

  const hasCalories = calories.some((c) => c.Prescribed > 0 || c.Actual > 0);
  const hasMacros = macros.some((m) => m.Protein > 0 || m.Carbs > 0 || m.Fat > 0);
  const hasAdherence = adherence.some((a) => a.Adherence != null);

  if (!hasCalories && !hasMacros && !hasAdherence) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No nutrition data yet for this enrollment — charts appear once days elapse.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {hasCalories && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Calories per week (kcal)
          </p>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={calories} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Prescribed" radius={[6, 6, 0, 0]} fill="var(--muted-foreground)" maxBarSize={38} />
              <Bar dataKey="Actual" radius={[6, 6, 0, 0]} fill="var(--primary)" maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasMacros && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Actual macros per week (g)
          </p>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={macros} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Protein" stroke="var(--primary)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Carbs" stroke="var(--teal)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Fat" stroke="var(--gold)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasAdherence && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Adherence per week (%)
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={adherence} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [`${value}%`, "Adherence"]}
              />
              <Bar dataKey="Adherence" radius={[6, 6, 0, 0]} fill="var(--primary)" maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-muted-foreground mt-1">
            Completed meals ÷ elapsed planned meals. Future weeks show no bar until days elapse.
          </p>
        </div>
      )}
    </div>
  );
}
