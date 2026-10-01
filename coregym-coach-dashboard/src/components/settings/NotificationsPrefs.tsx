"use client";

import * as React from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { describeError } from "@/lib/user-error";
import { useI18n } from "@/lib/i18n/client";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Moon } from "lucide-react";

// Real notification preferences from the existing `notification_preferences`
// table (own-row RLS). Only settings the backend supports are shown — the
// table has: meal_reminders, water_reminders, calorie_alerts, chat
// notifications and quiet hours.
type Prefs = {
  meal_reminders_enabled: boolean;
  water_reminders_enabled: boolean;
  calorie_alerts_enabled: boolean;
  chat_notifications_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

const ROWS: { key: keyof Prefs; labelKey: "meals" | "water" | "calories" | "messages" }[] = [
  { key: "meal_reminders_enabled", labelKey: "meals" },
  { key: "water_reminders_enabled", labelKey: "water" },
  { key: "calorie_alerts_enabled", labelKey: "calories" },
  { key: "chat_notifications_enabled", labelKey: "messages" },
];

export function NotificationsPrefs() {
  const { t } = useI18n();
  const supabase = React.useMemo(() => createClient(), []);
  const [prefs, setPrefs] = React.useState<Prefs | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      if (error) toast.error(describeError(error, t("settings.notifications.genericError")));
      setPrefs(
        (data as unknown as Prefs) ?? {
          meal_reminders_enabled: true,
          water_reminders_enabled: true,
          calorie_alerts_enabled: true,
          chat_notifications_enabled: true,
          quiet_hours_start: null,
          quiet_hours_end: null,
        }
      );
      setLoading(false);
    })();
  }, [supabase, t]);

  async function save(next: Prefs) {
    const prev = prefs;
    setPrefs(next);
    setSaving(true);
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? "";
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: uid, ...next, updated_at: new Date().toISOString() });
      if (error) throw new Error(describeError(error, t("settings.notifications.requestFailed")));
      toast.success(t("settings.notifications.saved"));
    } catch (err: unknown) {
      if (prev) setPrefs(prev); // roll back the optimistic toggle
      toast.error(err instanceof Error ? err.message : t("settings.notifications.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground flex items-center gap-2"><Spinner size="sm" /> {t("settings.notifications.loading")}</p>;
  if (!prefs) return <p className="text-sm text-muted-foreground">{t("settings.notifications.loadFailed")}</p>;

  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

  return (
    <div className="space-y-4">
      {ROWS.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-4 rounded-lg bg-secondary p-3">
          <div className="min-w-0">
            <p className="text-label-lg text-foreground">{t(`settings.notifications.${row.labelKey}`)}</p>
            <p className="text-body-sm text-faint">{t(`settings.notifications.${row.labelKey}Desc`)}</p>
          </div>
          <Switch
            checked={Boolean(prefs[row.key])}
            onCheckedChange={(v: boolean) => void save({ ...prefs, [row.key]: v })}
            disabled={saving}
            aria-label={t(`settings.notifications.${row.labelKey}`)}
            className="scale-110"
          />
        </div>
      ))}
      {/* Quiet hours — one functional row; times are stored as HH:MM, no
          fixed-timezone display is faked. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg bg-background p-4 shadow-inner">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-label-lg text-foreground">
            <Moon className="size-4 text-primary" aria-hidden="true" />
            {t("settings.notifications.quietTitle")}
          </p>
          <p className="text-body-sm text-faint">{t("settings.notifications.quietDesc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="qh-start" className="text-label-sm">{t("settings.notifications.from")}</Label>
            <Input
              id="qh-start"
              type="time"
              value={prefs.quiet_hours_start ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setPrefs({ ...prefs, quiet_hours_start: v });
                if (v === "" || timeRe.test(v)) void save({ ...prefs, quiet_hours_start: v || null });
              }}
              className="w-32 bg-transparent px-2 text-body-md"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="qh-end" className="text-label-sm">{t("settings.notifications.to")}</Label>
            <Input
              id="qh-end"
              type="time"
              value={prefs.quiet_hours_end ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setPrefs({ ...prefs, quiet_hours_end: v });
                if (v === "" || timeRe.test(v)) void save({ ...prefs, quiet_hours_end: v || null });
              }}
              className="w-32 bg-transparent px-2 text-body-md"
            />
          </div>
        </div>
      </div>
      <p className="text-body-sm text-muted-foreground">
        {t("settings.notifications.futureHint")}
      </p>
    </div>
  );
}
