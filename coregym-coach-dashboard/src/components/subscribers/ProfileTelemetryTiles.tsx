import { Flame } from "lucide-react";

// Stitch "Telemetry vs targets" section for the client profile: four tiles
// (body weight, nutrition energy, microcycle adherence, milestone PR) fed by
// data the profile page already loads. Server-safe; all display strings are
// pre-localized by the page so this component is layout-only. Every tile
// renders an explicit empty state — nothing is invented to fill gaps.

export type TelemetryWeight = {
  label: string;
  unit: string;
  valueKg: number | null;
  /** Signed delta vs the first log ("+2.4" / "-1.3"); null when undetectable. */
  deltaLabel: string | null;
  deltaPositive: boolean;
  targetLine: string | null;
  pctToGoal: number | null;
  pctLine: string | null;
};

export type TelemetryEnergy = {
  label: string;
  /** Pre-formatted metric readout (fmt.num of today's kcal); "—" when nothing logged. */
  kcalLabel: string;
  /** Pre-localized "/ {n} kcal" suffix; omitted when no goal is set. */
  goalSuffix: string | null;
  /** grams feeds the share bar; display is the pre-formatted cell value. */
  macros: { label: string; grams: number; display: string; valueClass: string }[];
};

export type TelemetryAdherence = {
  label: string;
  done: number;
  /** Weekly goal; null → honest "no goal" line instead of a fake target. */
  goal: number | null;
  goalSuffix: string | null;
  footerLine: string;
};

export type TelemetryPR = {
  label: string;
  recordChip: string;
  headline: string | null;
  achievedLine: string | null;
  emptyLine: string | null;
  volumeLabel: string;
  bars: { label: string; volume: number }[];
};

const TILE =
  "flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-border";

function TileLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-label-sm uppercase tracking-wider text-faint">{children}</p>;
}

export function ProfileTelemetryTiles({
  sectionTitle,
  weight,
  energy,
  adherence,
  pr,
}: {
  sectionTitle: string;
  weight: TelemetryWeight;
  energy: TelemetryEnergy;
  adherence: TelemetryAdherence;
  pr: TelemetryPR;
}) {
  const maxVolume = Math.max(...pr.bars.map((b) => b.volume), 1);
  const totalMacro = energy.macros.reduce((s, m) => s + m.grams, 0);
  const MACRO_BAR = ["bg-primary", "bg-teal", "bg-gold"];

  return (
    <section className="flex flex-col gap-4" aria-label={sectionTitle}>
      <div className="flex items-center gap-2.5">
        <span className="size-2.5 rounded-full bg-primary" aria-hidden />
        <h2 className="font-display text-headline-sm uppercase tracking-wider text-foreground">{sectionTitle}</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Body weight */}
        <div className={TILE}>
          <TileLabel>{weight.label}</TileLabel>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-display text-metric-display tabular-nums tracking-tight text-foreground">
              {weight.valueKg != null ? weight.valueKg : "—"}
            </span>
            <span className="text-headline-sm text-faint">{weight.unit}</span>
            {weight.deltaLabel && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-label-sm font-bold tabular-nums ${
                  weight.deltaPositive ? "bg-mint/20 text-mint" : "bg-[#ea7a72]/20 text-[#ea7a72]"
                }`}
              >
                {weight.deltaLabel}
              </span>
            )}
          </div>
          {weight.targetLine && <p className="text-body-sm text-muted-foreground">{weight.targetLine}</p>}
          {weight.pctToGoal != null && weight.pctLine && (
            <>
              <p className="text-body-sm font-semibold text-foreground">{weight.pctLine}</p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.max(0, weight.pctToGoal))}%` }}
                />
              </div>
            </>
          )}
        </div>

        {/* Nutrition energy */}
        <div className={TILE}>
          <TileLabel>{energy.label}</TileLabel>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-display text-metric-display tabular-nums tracking-tight text-foreground">
              {energy.kcalLabel}
            </span>
            {energy.goalSuffix && <span className="text-headline-sm text-faint">{energy.goalSuffix}</span>}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {energy.macros.map((m) => (
              <div key={m.label} className="rounded bg-accent py-1 text-center">
                <p className="text-[10px] uppercase tracking-wider text-faint">{m.label}</p>
                <p className={`text-body-md font-bold tabular-nums ${m.valueClass}`}>{m.display}</p>
              </div>
            ))}
          </div>
          {totalMacro > 0 && (
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              {energy.macros.map((m, i) => (
                <div
                  key={m.label}
                  className={MACRO_BAR[i % MACRO_BAR.length]}
                  style={{ width: `${(m.grams / totalMacro) * 100}%` }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Microcycle adherence */}
        <div className={TILE}>
          <TileLabel>{adherence.label}</TileLabel>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-display text-metric-display tabular-nums tracking-tight text-primary">
              {adherence.done}
            </span>
            {adherence.goalSuffix ? (
              <span className="text-headline-sm text-faint">{adherence.goalSuffix}</span>
            ) : null}
          </div>
          {/* Segments: one per allowed weekly workout (capped at 7) */}
          <div className="flex gap-1">
            {Array.from({ length: Math.min(Math.max(adherence.goal ?? 7, 1), 7) }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i < Math.min(adherence.done, 7) ? "bg-primary" : "bg-secondary"}`}
              />
            ))}
          </div>
          <p className="text-body-sm text-muted-foreground">{adherence.footerLine}</p>
        </div>

        {/* Milestone PR */}
        <div className={TILE}>
          <TileLabel>{pr.label}</TileLabel>
          <span className="inline-flex w-fit items-center gap-1 rounded-md bg-[#ea7a72]/20 px-1.5 py-0.5 text-label-sm font-bold uppercase tracking-wide text-[#ea7a72]">
            <Flame className="size-3" />
            {pr.recordChip}
          </span>
          {pr.headline ? (
            <>
              <p className="font-display text-headline-md tracking-tight text-foreground">{pr.headline}</p>
              {pr.achievedLine && <p className="text-body-sm text-muted-foreground">{pr.achievedLine}</p>}
            </>
          ) : (
            <p className="text-body-sm text-muted-foreground">{pr.emptyLine}</p>
          )}
          {pr.bars.some((b) => b.volume > 0) && (
            <div className="mt-auto space-y-1">
              <p className="text-label-sm uppercase tracking-wider text-faint">{pr.volumeLabel}</p>
              <div className="flex h-9 items-end gap-1">
                {pr.bars.map((b, i) => (
                  <div
                    key={b.label}
                    title={`${b.label}: ${b.volume}`}
                    className={`flex-1 rounded-t ${i === pr.bars.length - 1 ? "bg-primary" : "bg-accent"}`}
                    style={{ height: `${Math.max((b.volume / maxVolume) * 100, b.volume > 0 ? 12 : 3)}%` }}
                  />
                ))}
              </div>
              <div className="flex gap-1 text-[9px] tabular-nums text-faint">
                {pr.bars.map((b, i) => (
                  <span key={b.label} className={`flex-1 ${i === pr.bars.length - 1 ? "font-bold text-primary" : ""}`}>
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
