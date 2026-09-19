"use client";

import * as React from "react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Display-name editor for the Account section (PATCHes /api/coach/profile).
export function AccountNameForm({ initialName }: { initialName: string }) {
  const [name, setName] = React.useState(initialName);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    const v = name.trim();
    if (!v) {
      toast.error("Name cannot be empty");
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
      if (!res.ok) throw new Error(body?.error ?? "Save failed");
      toast.success("Name updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-sm space-y-2">
      <Label htmlFor="acc-name">Display name</Label>
      <div className="flex gap-2">
        <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Coach Ali" />
        <Button type="button" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Shown to clients in the CoreGym app.</p>
    </div>
  );
}

// Appearance — theme is real (next-themes); language/density are clearly
// marked as not available yet rather than faked.
export function AppearancePrefs() {
  const { theme, setTheme } = useTheme();
  const opts: { key: string; label: string }[] = [
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
    { key: "system", label: "Match system" },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">Theme</p>
        <p className="text-xs text-muted-foreground">Dashboard color mode. The sidebar toggle switches it too.</p>
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
        <p className="text-sm font-medium">Language</p>
        <p className="text-sm text-muted-foreground">
          English — Arabic support is planned but not built yet.
        </p>
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">Display density</p>
        <p className="text-sm text-muted-foreground">Not available yet — the dashboard uses one fixed comfortable density.</p>
      </div>
    </div>
  );
}
