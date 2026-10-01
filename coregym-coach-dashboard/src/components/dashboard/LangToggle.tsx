"use client";

import { useI18n } from "@/lib/i18n/client";

/* Toggles dashboard language EN ↔ AR. Sets the cookie (server components read
   it), flips <html lang/dir> immediately (no flash) and refreshes RSC content.
   Rendered as the Stitch sidebar pill: two segments, active one volt-tinted. */
export function LangToggle() {
  const { lang, t, setLang } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("common.lang.toggleLabel")}
      className="flex items-center gap-0.5 rounded-md bg-secondary p-0.5"
    >
      {(["en", "ar"] as const).map((l) => {
        const active = lang === l;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={active}
            title={l === "en" ? t("common.lang.switchToEnglish") : t("common.lang.switchToArabic")}
            onClick={() => {
              if (!active) setLang(l);
            }}
            className={`rounded px-2 py-0.5 text-label-sm transition-colors ${
              active ? "bg-sidebar-accent text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l === "en" ? "EN" : "ع"}
          </button>
        );
      })}
    </div>
  );
}
