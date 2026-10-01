"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { describeError } from "@/lib/user-error";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Camera, CheckCircle2, LogOut, Trash2 } from "lucide-react";

// Profile photo upload — avatars bucket, RLS allows each user to write only
// their own {uid}/ folder; bucket is public-read so the photo renders.
export function AvatarUpload({
  initialUrl,
  userId,
  name,
  onSaved,
}: {
  initialUrl: string | null;
  userId: string;
  name?: string;
  onSaved?: (url: string | null) => void;
}) {
  const { t } = useI18n();
  const supabase = React.useMemo(() => createClient(), []);
  const [url, setUrl] = React.useState<string | null>(initialUrl);
  const [uploading, setUploading] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error(t("settings.account.avatar.chooseImage"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("settings.account.avatar.tooLarge"));
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`; // cache-bust on replace
      const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId);
      if (dbErr) throw new Error(dbErr.message);
      setUrl(publicUrl);
      onSaved?.(publicUrl);
      toast.success(t("settings.account.avatar.updated"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.account.avatar.uploadFailed"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!url) return;
    setRemoving(true);
    try {
      const marker = url.split("?")[0].split("/avatars/")[1];
      if (marker) await supabase.storage.from("avatars").remove([marker]);
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
      if (error) throw new Error(describeError(error, t("settings.account.avatar.requestFailed")));
      setUrl(null);
      onSaved?.(null);
      toast.success(t("settings.account.avatar.removed"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.account.avatar.removeFailed"));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {/* The avatar itself opens the file picker; hover shows the camera affordance. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || removing}
        aria-label={t("settings.account.avatar.alt")}
        className="group relative size-20 shrink-0 overflow-hidden rounded-xl bg-secondary transition-opacity disabled:opacity-60"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- public avatar URL with cache-buster; next/image adds nothing
          <img src={url} alt={t("settings.account.avatar.alt")} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center font-display text-headline-sm font-bold text-muted-foreground">
            {userId.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {uploading ? <Spinner size="sm" /> : <Camera className="size-5 text-primary" aria-hidden="true" />}
        </span>
        <span
          className="absolute -bottom-1 -end-1 size-3.5 rounded-full bg-primary shadow-[0_0_6px_rgba(205,244,92,0.8)]"
          aria-hidden="true"
        />
      </button>
      <div className="min-w-0 space-y-2">
        {name ? (
          <p className="truncate font-display text-headline-sm leading-snug text-foreground">{name}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={uploading || removing}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1 text-label-sm text-foreground transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            {uploading ? <Spinner size="sm" className="me-0.5" /> : null}
            {t("settings.account.avatar.changeImage")}
          </button>
          {url && (
            <button
              type="button"
              disabled={removing}
              onClick={handleRemove}
              className="inline-flex items-center gap-1.5 rounded px-3 py-1 text-label-sm text-faint transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              {removing ? <Spinner size="sm" className="me-0.5" /> : <Trash2 className="size-3.5" aria-hidden="true" />}
              {t("common.actions.remove")}
            </button>
          )}
        </div>
        <p className="text-body-sm text-muted-foreground">{t("settings.account.avatar.hint")}</p>
      </div>
    </div>
  );
}

// Change email — Supabase Auth sends a confirmation to the new address; the
// change applies after the user confirms.
export function EmailChange({ currentEmail }: { currentEmail: string }) {
  const { t } = useI18n();
  const supabase = React.useMemo(() => createClient(), []);
  const [email, setEmail] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    const next = email.trim();
    if (!next || !next.includes("@")) {
      toast.error(t("settings.account.email.invalid"));
      return;
    }
    if (next === currentEmail) {
      toast.info(t("settings.account.email.alreadyCurrent"));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: next });
      if (error) throw new Error(describeError(error, t("settings.account.email.requestFailed")));
      toast.success(t("settings.account.email.confirmSent"));
      setEmail("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.account.email.updateFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="acc-email-current">{t("settings.account.email.current")}</Label>
        <div className="flex items-center gap-2">
          <Input
            id="acc-email-current"
            value={currentEmail}
            readOnly
            disabled
            className="h-10 bg-background px-3 text-body-md"
          />
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-mint/15 px-2 py-0.5 text-label-sm text-mint">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {t("settings.account.email.verified")}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="acc-email-new">{t("settings.account.email.new")}</Label>
        <div className="flex gap-2">
          <Input
            id="acc-email-new"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="new@email.com"
            className="h-10 bg-background px-3 text-body-md"
          />
          <Button type="button" className="h-10" onClick={handleSave} disabled={saving || !email.trim()}>
            {saving ? <Spinner size="sm" className="me-1" /> : null}
            {t("common.actions.update")}
          </Button>
        </div>
        <p className="text-body-sm text-muted-foreground">
          {t("settings.account.email.hint")}
        </p>
      </div>
    </div>
  );
}

/** Client-side strength heuristic for the meter — VISUAL ONLY. The real
    validation (min length, match) still gates the submit below. */
function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (score <= 1) return 1;
  if (score === 2) return 2;
  if (score === 3) return 3;
  return 4;
}

const STRENGTH_COLORS = ["bg-destructive", "bg-warning", "bg-primary", "bg-mint"] as const;
const STRENGTH_KEYS = [
  "settings.security.strength.weak",
  "settings.security.strength.fair",
  "settings.security.strength.good",
  "settings.security.strength.strong",
] as const;

// Change password + sign out everywhere — real Supabase Auth operations.
// hasEmailIdentity=false means the account has no email/password identity
// (e.g. Google-only): updateUser({ password }) then SETS a first password
// (enabling email+password sign-in) instead of changing an existing one.
export function SecurityControls({ hasEmailIdentity = true }: { hasEmailIdentity?: boolean }) {
  const { t } = useI18n();
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleChangePassword() {
    if (pw.length < 8) {
      toast.error(t("settings.security.tooShort"));
      return;
    }
    if (pw !== pw2) {
      toast.error(t("settings.security.mismatch"));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw new Error(describeError(error, t("settings.security.requestFailed")));
      // AUTH-02: a password change must not leave a stolen session logged in.
      // Revokes every OTHER session/refresh token; the current device stays
      // signed in so the coach isn't logged out mid-flow.
      const { error: revokeErr } = await supabase.auth.signOut({ scope: "others" });
      if (revokeErr) console.error("[settings] session revocation after password change failed", revokeErr);
      toast.success(
        hasEmailIdentity
          ? t("settings.security.updated")
          : t("settings.security.set")
      );
      setPw("");
      setPw2("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.security.updateFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOutAll() {
    if (!window.confirm(t("settings.security.signOutConfirm"))) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw new Error(describeError(error, t("settings.security.requestFailed")));
      router.replace("/login");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.security.signOutFailed"));
      setSigningOut(false);
    }
  }

  const strength = passwordStrength(pw);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* Password column — no "current password" field: Supabase updateUser
          does not take one. */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="sec-pw">{t("settings.security.newPw")}</Label>
          <Input
            id="sec-pw"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            minLength={8}
            placeholder={t("settings.security.newPwPlaceholder")}
            className="h-10 bg-background px-3 text-body-md shadow-inner"
          />
        </div>
        {pw.length > 0 && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="flex items-center gap-3">
              <div className="flex flex-1 gap-1" aria-hidden="true">
                {[1, 2, 3, 4].map((seg) => (
                  <span
                    key={seg}
                    className={`h-1 flex-1 rounded-full ${seg <= strength ? STRENGTH_COLORS[strength - 1] : "bg-secondary"}`}
                  />
                ))}
              </div>
              <span className="text-body-sm text-faint">{t(STRENGTH_KEYS[strength - 1])}</span>
            </div>
            <p className="sr-only">{t("settings.security.strength.label")}</p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="sec-pw2">{t("settings.security.confirmPlaceholder")}</Label>
          <Input
            id="sec-pw2"
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder={t("settings.security.confirmPlaceholder")}
            className="h-10 bg-background px-3 text-body-md shadow-inner"
          />
        </div>
        {!hasEmailIdentity && (
          <p className="text-body-sm text-muted-foreground">
            {t("settings.security.googleNote")}
          </p>
        )}
        <Button type="button" onClick={handleChangePassword} disabled={saving || pw.length < 8 || pw !== pw2}>
          {saving ? <Spinner size="sm" className="me-1" /> : null}
          {hasEmailIdentity ? t("settings.security.updatePw") : t("settings.security.setPw")}
        </Button>
      </div>

      {/* Sessions column */}
      <div className="flex flex-col items-start gap-2 self-start rounded-xl bg-secondary/50 p-4">
        <p className="text-label-lg text-foreground">{t("settings.security.sessionsTitle")}</p>
        <p className="text-body-sm text-faint">
          {t("settings.security.sessionsDesc")}
        </p>
        <Button
          type="button"
          variant="destructive"
          className="mt-2 w-full"
          onClick={handleSignOutAll}
          disabled={signingOut}
        >
          {signingOut ? <Spinner size="sm" className="me-1" /> : <LogOut className="me-1 size-3.5" aria-hidden="true" />}
          {t("settings.security.signOutAll")}
        </Button>
      </div>
    </div>
  );
}
