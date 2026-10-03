"use client";

import dynamic from "next/dynamic";

// P-06: lazy wrapper — see OverviewChartsLazy.tsx for the rationale. The two
// result blocks render at height 190 each plus section labels (~444 total);
// the placeholder matches so hydration introduces no layout jump.
const ExerciseResults = dynamic(
  () => import("./ExerciseResults").then((m) => m.ExerciseResults),
  { loading: () => <div style={{ height: 440 }} aria-hidden="true" /> }
);
export default ExerciseResults;
export { ExerciseResults };
