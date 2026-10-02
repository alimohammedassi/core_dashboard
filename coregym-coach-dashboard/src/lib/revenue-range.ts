// Revenue date-range presets (?range=30d|90d|all) — server-safe module so the
// server page can resolve the param; the client selector re-exports for UI use.

export type RevRange = "30d" | "90d" | "all";

export const REV_RANGES: RevRange[] = ["30d", "90d", "all"];

export function resolveRevRange(raw?: string | null): RevRange {
  return raw === "90d" || raw === "all" ? raw : "30d";
}
