/* Core translation machinery: dot-path lookup with English fallback,
   {var} interpolation, and the DeepKeys type that makes t() keys
   compile-time checked against the English dictionary shape. */

export type Vars = Record<string, string | number>;

/** Interpolate "{name}" placeholders; unknown placeholders are left as-is. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/** Resolve a "a.b.c" path into a string leaf; undefined when missing/not a leaf. */
export function lookup(dict: unknown, path: string): string | undefined {
  let current: unknown = dict;
  for (const part of path.split(".")) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
}

/** Build a t() bound to one language. Missing Arabic keys fall back to English
    (never throws) so a partial translation degrades gracefully. */
export function makeT(dict: { en: unknown; ar: unknown }, lang: "en" | "ar") {
  return (key: string, vars?: Vars): string => {
    const template =
      lookup(lang === "ar" ? dict.ar : dict.en, key) ?? lookup(dict.en, key) ?? key;
    return interpolate(template, vars);
  };
}

/* ── Compile-time key checking ──────────────────────────────────────────────
   TKey = every dot-path through the English dictionary that ends at a string
   leaf. Arrays are deliberately NOT addressable — enumerate keys instead. */
type Primitive = string;

export type DeepKeys<T> = T extends Primitive
  ? string
  : T extends object
    ? {
        [K in keyof T & string]: T[K] extends Primitive
          ? K
          : T[K] extends readonly Primitive[]
            ? never
            : `${K}.${DeepKeys<T[K]>}`;
      }[keyof T & string]
    : never;
