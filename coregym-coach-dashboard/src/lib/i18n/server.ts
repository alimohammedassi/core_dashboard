/* Server-side i18n access for RSC pages/layouts. Reads the language cookie so
   the server renders the right language (and <html dir>) on first paint —
   no flash of wrong direction. */

import { cookies } from "next/headers";
import { DEFAULT_LANG, isLang, LANG_COOKIE, type Lang } from "./config";
import { tFor, type TFn } from "./dictionary";
import { formatters, type Formatters } from "./format";

export async function getLang(): Promise<Lang> {
  const store = await cookies();
  const value = store.get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

export interface I18n {
  lang: Lang;
  dir: "ltr" | "rtl";
  t: TFn;
  fmt: Formatters;
}

export async function getI18n(): Promise<I18n> {
  const lang = await getLang();
  return { lang, dir: lang === "ar" ? "rtl" : "ltr", t: tFor(lang), fmt: formatters(lang) };
}
