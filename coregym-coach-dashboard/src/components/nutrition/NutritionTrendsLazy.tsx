"use client";

import dynamic from "next/dynamic";

// P-06: lazy wrapper — see ../subscribers/ExerciseResultsLazy.tsx rationale.
// NutritionTrends stacks three charts (190/190/160) plus section labels
// (~620 total); the placeholder matches so hydration introduces no jump.
const NutritionTrends = dynamic(
  () => import("./NutritionTrends").then((m) => m.NutritionTrends),
  { loading: () => <div style={{ height: 620 }} aria-hidden="true" /> }
);
export default NutritionTrends;
export { NutritionTrends };
