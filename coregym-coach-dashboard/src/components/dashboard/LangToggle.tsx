"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

/* Toggles dashboard language EN ↔ AR. Sets the cookie (server components read
   it), flips <html lang/dir> immediately (no flash) and refreshes RSC content.
   Shows the language you'd switch TO, like the landing navbar. */
export function LangToggle() {
  const { lang, t, setLang } = useI18n();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("common.lang.toggleLabel")}
      title={lang === "en" ? t("common.lang.switchToArabic") : t("common.lang.switchToEnglish")}
      onClick={() => setLang(lang === "en" ? "ar" : "en")}
    >
      <span className="flex items-center gap-1 text-xs font-medium">
        <Languages className="size-4" />
        {lang === "en" ? "ع" : "EN"}
      </span>
    </Button>
  );
}
