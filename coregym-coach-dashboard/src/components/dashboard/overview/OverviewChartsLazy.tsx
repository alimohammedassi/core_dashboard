"use client";

import dynamic from "next/dynamic";

// P-06: recharts is the heaviest dependency in the client bundle (~395KB of
// eager JS on the overview route, dev-measured). These lazy wrappers move the
// recharts code into an async chunk (preloaded by Next) that hydrates in
// place of a fixed-height placeholder — no props or rendering behavior change.
// Placeholder heights match each component's full rendered height (shell +
// ResponsiveContainer) so the swap introduces no layout jump.

const withHeight = (px: number) =>
  function ChartPlaceholder() {
    return <div style={{ height: px }} aria-hidden="true" />;
  };

// header ≈ 48 + container 280 + gap
export const RevenueGrowthChart = dynamic(
  () => import("./OverviewCharts").then((m) => m.RevenueGrowthChart),
  { loading: withHeight(340) }
);

// legend row ≈ 24 + container 190 + gap
export const WeekdayBarChart = dynamic(
  () => import("./OverviewCharts").then((m) => m.WeekdayBarChart),
  { loading: withHeight(220) }
);

// half-circle svg: 210/2 + 18 = 123
export const AdherenceGauge = dynamic(
  () => import("./OverviewCharts").then((m) => m.AdherenceGauge),
  { loading: withHeight(125) }
);
