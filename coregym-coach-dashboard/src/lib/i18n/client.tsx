"use client";

/* Client-side i18n: provider fed by the server (cookie → <html lang/dir>),
   plus setLang() which updates state, cookie, document attributes and refreshes
   server components in one go. */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, type Lang } from "./config";
import { tFor, type TFn } from "./dictionary";
import { formatters, type Formatters } from "./format";

export interface I18nContextValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  t: TFn;
  fmt: Formatters;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  lang: initialLang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const router = useRouter();

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      // 1 year, path-wide so server components and API pages all see it.
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      const html = document.documentElement;
      html.lang = next;
      html.dir = next === "ar" ? "rtl" : "ltr";
      // Re-render every server component (page content, tables, charts) in the
      // new language; client components re-render from state immediately.
      router.refresh();
    },
    [router],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      t: tFor(lang),
      fmt: formatters(lang),
      setLang,
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Convenience hook: just the t() function. */
export function useT(): TFn {
  return useI18n().t;
}
