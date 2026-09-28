/* Merges all domain dictionaries and derives the compile-time-checked key type.
   Each domain file owns its own en/ar pair; t() falls back to English at
   runtime when an Arabic key is missing (enforced separately by the key-parity
   check in tests/i18n-parity.test.ts). */

import { common } from "./domains/common";
import { auth } from "./domains/auth";
import { overview } from "./domains/overview";
import { subscribers } from "./domains/subscribers";
import { workouts } from "./domains/workouts";
import { programs } from "./domains/programs";
import { nutrition } from "./domains/nutrition";
import { plans } from "./domains/plans";
import { revenue } from "./domains/revenue";
import { settings } from "./domains/settings";
import { chat } from "./domains/chat";
import { misc } from "./domains/misc";
import { makeT } from "./translate";
import type { DeepKeys, Vars } from "./translate";
import type { Lang } from "./config";

export const dictionary = {
  common,
  auth,
  overview,
  subscribers,
  workouts,
  programs,
  nutrition,
  plans,
  revenue,
  settings,
  chat,
  misc,
} as const;

/** English-only shape — the source of truth for t() keys. */
export type Dict = {
  [K in keyof typeof dictionary]: (typeof dictionary)[K]["en"];
};

export type TKey = DeepKeys<Dict>;

export type TFn = (key: TKey, vars?: Vars) => string;

export function tFor(lang: Lang): TFn {
  return makeT(dictionary, lang);
}
