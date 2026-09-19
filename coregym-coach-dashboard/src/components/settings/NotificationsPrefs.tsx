"use client";

import * as React from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

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

const ROWS: { key: keyof Prefs; label: string; description: string }[] = [
  { key: "meal_reminders_enabled", label: "Meal reminders", description: "Reminders to log meals in the CoreGym app." },
  { key: "water_reminders_enabled", label: "Water reminders", description: "Periodic hydration reminders for clients." },
  { key: "calorie_alerts_enabled", label: "Calorie alerts", description: "Alerts when a client goes over or under their calorie goal." },
  { key: "chat_notifications_enabled", label: "Client messages", description: "Notify when a client sends a chat message." },
];

export function NotificationsPrefs() {
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
      if (error) toast.error(error.message);
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
  }, [supabase]);

  async function save(next: Prefs) {
    setPrefs(next);
    setSaving(true);
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? "";
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: uid, ...next, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      toast.success("Notification preferences saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" /> Loading preferences…</p>;
  if (!prefs) return <p className="text-sm text-muted-foreground">Could not load preferences.</p>;

  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

  return (
    <div className="space-y-4">
      {ROWS.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">{row.label}</p>
            <p className="text-xs text-muted-foreground">{row.description}</p>
          </div>
          <Switch
            checked={Boolean(prefs[row.key])}
            onCheckedChange={(v: boolean) => void save({ ...prefs, [row.key]: v })}
            disabled={saving}
            aria-label={row.label}
          />
        </div>
      ))}
      <div className="rounded-lg border p-3 space-y-3">
        <p className="text-sm font-medium">Quiet hours</p>
        <p className="text-xs text-muted-foreground">No reminders during this window.</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="space-y-1">
            <Label htmlFor="qh-start" className="text-xs">From</Label>
            <Input
              id="qh-start"
              type="time"
              value={prefs.quiet_hours_start ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setPrefs({ ...prefs, quiet_hours_start: v });
                if (v === "" || timeRe.test(v)) void save({ ...prefs, quiet_hours_start: v || null });
              }}
              className="w-32"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="qh-end" className="text-xs">To</Label>
            <Input
              id="qh-end"
              type="time"
              value={prefs.quiet_hours_end ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setPrefs({ ...prefs, quiet_hours_end: v });
                if (v === "" || timeRe.test(v)) void save({ ...prefs, quiet_hours_end: v || null });
              }}
              className="w-32"
            />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Email digests and workout-activity alerts are not available yet — they will appear here when the app adds them.
      </p>
    </div>
  );
}
