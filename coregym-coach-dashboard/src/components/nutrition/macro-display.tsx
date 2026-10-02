import { cn } from "cn";
import type { MacroSet } from "@/lib/nutrition-math";

/* Stitch macro displays shared by the program builder and the enrollment
   analytics page. Values are display-rounded by the callers (roundMacros).
   Color code: kcal → foreground, protein → mint, carbs → volt (primary),
   fat → faint. The "kcal" unit and P/C/F shorthand stay Latin in both
   languages (same convention as nutrition.macros.compact); each segment is
   its own span, so RTL logical order follows the document direction. */

/** Compact colored summary: "1240 kcal · 120P / 150C / 45F". */
export function MacroPill({
  macros,
  kcal = true,
  className,
}: {
  macros: MacroSet;
  /** Render the kcal segment (off where the caller already shows kcal/day). */
  kcal?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1 whitespace-nowrap", className)}>
      {kcal ? (
        <>
          <span className="font-bold tabular-nums">{Math.round(macros.calories)}</span>
          <span className="text-faint">kcal</span>
          <span className="text-faint">·</span>
        </>
      ) : null}
      <span className="font-bold tabular-nums text-mint">{macros.protein_g}P</span>
      <span className="text-faint">/</span>
      <span className="font-bold tabular-nums text-primary">{macros.carbs_g}C</span>
      <span className="text-faint">/</span>
      <span className="font-bold tabular-nums text-faint">{macros.fat_g}F</span>
    </span>
  );
}

/** 4-column KCAL/PRO/CARB/FAT readout used on picker match cards and food
   tiles. Labels are passed in pre-localized so this stays server-safe. */
export function MacroGrid({
  macros,
  labels,
  className,
}: {
  macros: MacroSet;
  labels: { kcal: string; protein: string; carbs: string; fat: string };
  className?: string;
}) {
  const cells = [
    {
      key: "kcal",
      label: labels.kcal,
      labelClass: "text-faint",
      value: Math.round(macros.calories),
      valueClass: "text-foreground",
    },
    { key: "protein", label: labels.protein, labelClass: "text-mint", value: macros.protein_g, valueClass: "text-mint" },
    { key: "carbs", label: labels.carbs, labelClass: "text-primary", value: macros.carbs_g, valueClass: "text-primary" },
    { key: "fat", label: labels.fat, labelClass: "text-faint", value: macros.fat_g, valueClass: "text-faint" },
  ];
  return (
    <div className={cn("grid grid-cols-4 gap-1 rounded-lg bg-secondary/60 p-1.5 text-center", className)}>
      {cells.map((c) => (
        <div key={c.key} className="min-w-0">
          <p className={cn("truncate text-[10px] uppercase tracking-wider", c.labelClass)}>{c.label}</p>
          <p className={cn("mt-0.5 text-label-sm font-bold tabular-nums leading-tight", c.valueClass)}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

/** Numbered meal chip ("MEAL 01"): callers pass the localized, zero-padded
   label (e.g. t("nutrition.builder.numberedMeal", { n: "01" })). */
export function MealChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded bg-secondary px-2 py-0.5 text-label-sm font-bold uppercase tracking-wider text-primary",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Zero-padded 2-digit meal number for the MEAL chips. */
export function mealNo(index: number): string {
  return String(Math.max(1, index)).padStart(2, "0");
}
