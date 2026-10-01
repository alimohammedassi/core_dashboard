"use client";

import * as React from "react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n/client";

// Display-name editor for the Account section (PATCHes /api/coach/profile).
export function AccountNameForm({ initialName }: { initialName: string }) {
  const { t } = useI18n();
  const [name, setName] = React.useState(initialName);
  const [savedName, setSavedName] = React.useState(initialName);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    const v = name.trim();
    if (!v) {
      toast.error(t("settings.account.name.empty"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/coach/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: v }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? t("settings.account.name.saveFailed"));
      setSavedName(v);
      toast.success(t("settings.account.name.updated"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.account.name.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-sm space-y-2">
      <Label htmlFor="acc-name">{t("settings.account.name.label")}</Label>
      <div className="flex gap-2">
        <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t("settings.account.name.placeholder")} />
        <Button type="button" onClick={handleSave} disabled={saving || !name.trim() || name.trim() === savedName}>
          {saving ? <Spinner size="sm" className="me-1" /> : null}
          {t("common.actions.save")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("settings.account.name.hint")}</p>
    </div>
  );
}

// Appearance — theme is real (next-themes); language/density are clearly
// marked as not available yet rather than faked. Language itself IS live via
// the sidebar toggle, so the box points there.
export function AppearancePrefs() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const opts: { key: string; label: string }[] = [
    { key: "light", label: t("settings.appearance.light") },
    { key: "dark", label: t("settings.appearance.dark") },
    { key: "system", label: t("settings.appearance.system") },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("settings.appearance.theme")}</p>
        <p className="text-xs text-muted-foreground">{t("settings.appearance.themeDesc")}</p>
        <div className="flex flex-wrap gap-2">
          {opts.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setTheme(o.key)}
              aria-pressed={theme === o.key}
              className={
                "rounded-lg border px-3 py-1.5 text-sm transition-colors " +
                (theme === o.key
                  ? "border-primary/30 bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted")
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">{t("settings.appearance.language")}</p>
        <p className="text-sm text-muted-foreground">
          {t("settings.appearance.languageDesc")}
        </p>
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">{t("settings.appearance.density")}</p>
        <p className="text-sm text-muted-foreground">{t("settings.appearance.densityDesc")}</p>
      </div>
    </div>
  );
}
