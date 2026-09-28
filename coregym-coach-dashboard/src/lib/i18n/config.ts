/* Supported dashboard languages. Arabic is full RTL (dir + Cairo font + Arabic
   UI strings); English keeps the original LTR layout. The active language is
   stored in a cookie so SERVER components can localize too (not just client). */
export type Lang = "en" | "ar";

export const LANGS: readonly Lang[] = ["en", "ar"] as const;

export const DEFAULT_LANG: Lang = "en";

export const LANG_COOKIE = "coregym-lang";

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "ar";
}

export function dirFor(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}

/* ar-EG keeps Egyptian month/day names but renders digits 0-9 (Latin) — the
   dashboard is data-dense and the landing already uses Latin digits in Arabic. */
export function intlLocale(lang: Lang): string {
  return lang === "ar" ? "ar-EG-u-nu-latn" : "en-US";
}
