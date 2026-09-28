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
import { useI18n } from "@/lib/i18n/client";

// Nutrition trends for one enrollment: prescribed vs current calories,
// actual macros, and adherence per week. Sibling of ExerciseResults — same
// container expectations, same axis/tooltip styling, same empty-state voice.
// recharts SVGs are not RTL-aware: each chart is wrapped in <div dir="ltr">
// while axis/legend/tooltip labels come from t()/fmt.

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--popover-foreground)",
  fontSize: 12,
};

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };

export function NutritionTrends({ weekly }: { weekly: WeeklyNutrition[] }) {
  const { t, fmt } = useI18n();

  const prescribedLabel = t("nutrition.trends.prescribed");
  const actualLabel = t("nutrition.trends.actual");
  const proteinLabel = t("nutrition.macros.protein");
  const carbsLabel = t("nutrition.macros.carbs");
  const fatLabel = t("nutrition.macros.fat");
  const adherenceLabel = t("nutrition.trends.adherence");
  const weekLabel = (n: number) => t("nutrition.trends.week", { n });

  const calories = weekly.map((w) => ({
    week: weekLabel(w.week),
    [prescribedLabel]: Math.round(w.prescribed.calories),
    [actualLabel]: Math.round(w.current.calories),
  }));
  const macros = weekly.map((w) => ({
    week: weekLabel(w.week),
    [proteinLabel]: w.current.protein_g,
    [carbsLabel]: w.current.carbs_g,
    [fatLabel]: w.current.fat_g,
  }));
  const adherence = weekly.map((w) => ({
    week: weekLabel(w.week),
    [adherenceLabel]: w.pct,
  }));

  const hasCalories = weekly.some(
    (w) => Math.round(w.prescribed.calories) > 0 || Math.round(w.current.calories) > 0
  );
  const hasMacros = weekly.some(
    (w) => w.current.protein_g > 0 || w.current.carbs_g > 0 || w.current.fat_g > 0
  );
  const hasAdherence = weekly.some((w) => w.pct != null);

  if (!hasCalories && !hasMacros && !hasAdherence) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {t("nutrition.trends.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {hasCalories && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            {t("nutrition.trends.caloriesTitle")}
          </p>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={calories} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={prescribedLabel} radius={[6, 6, 0, 0]} fill="var(--muted-foreground)" maxBarSize={38} />
                <Bar dataKey={actualLabel} radius={[6, 6, 0, 0]} fill="var(--primary)" maxBarSize={38} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasMacros && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            {t("nutrition.trends.macrosTitle")}
          </p>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={macros} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey={proteinLabel} stroke="var(--primary)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey={carbsLabel} stroke="var(--teal)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey={fatLabel} stroke="var(--gold)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasAdherence && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            {t("nutrition.trends.adherenceTitle")}
          </p>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={adherence} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [fmt.percent(Number(value)), adherenceLabel]}
                />
                <Bar dataKey={adherenceLabel} radius={[6, 6, 0, 0]} fill="var(--primary)" maxBarSize={38} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {t("nutrition.trends.adherenceNote")}
          </p>
        </div>
      )}
    </div>
  );
}
