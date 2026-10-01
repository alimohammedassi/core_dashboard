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
import { Upload, Trash2 } from "lucide-react";

// Profile photo upload — avatars bucket, RLS allows each user to write only
// their own {uid}/ folder; bucket is public-read so the photo renders.
export function AvatarUpload({
  initialUrl,
  userId,
  onSaved,
}: {
  initialUrl: string | null;
  userId: string;
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
      <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- public avatar URL with cache-buster; next/image adds nothing
          <img src={url} alt={t("settings.account.avatar.alt")} className="size-full object-cover" />
        ) : (
          <span className="text-sm font-bold text-muted-foreground">{userId.slice(0, 2).toUpperCase()}</span>
        )}
      </span>
      <div className="space-y-1.5">
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={uploading || removing} onClick={() => inputRef.current?.click()}>
            {uploading ? <Spinner size="sm" className="me-1" /> : <Upload className="me-1 size-3.5" />}
            {uploading ? t("settings.account.avatar.uploading") : url ? t("settings.account.avatar.replace") : t("settings.account.avatar.upload")}
          </Button>
          {url && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={removing} onClick={handleRemove}>
              {removing ? <Spinner size="sm" className="me-1" /> : <Trash2 className="me-1 size-3.5" />}
              {t("common.actions.remove")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("settings.account.avatar.hint")}</p>
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
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="acc-email-current">{t("settings.account.email.current")}</Label>
        <Input id="acc-email-current" value={currentEmail} readOnly disabled className="bg-muted/40" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="acc-email-new">{t("settings.account.email.new")}</Label>
        <div className="flex gap-2">
          <Input id="acc-email-new" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new@email.com" />
          <Button type="button" onClick={handleSave} disabled={saving || !email.trim()}>
            {saving ? <Spinner size="sm" className="me-1" /> : null}
            {t("common.actions.update")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("settings.account.email.hint")}
        </p>
      </div>
    </div>
  );
}

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

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Label htmlFor="sec-pw">{t("settings.security.newPw")}</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input id="sec-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} placeholder={t("settings.security.newPwPlaceholder")} />
          <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder={t("settings.security.confirmPlaceholder")} />
        </div>
        {!hasEmailIdentity && (
          <p className="text-xs text-muted-foreground">
            {t("settings.security.googleNote")}
          </p>
        )}
        <Button type="button" onClick={handleChangePassword} disabled={saving || pw.length < 8 || pw !== pw2}>
          {saving ? <Spinner size="sm" className="me-1" /> : null}
          {hasEmailIdentity ? t("settings.security.updatePw") : t("settings.security.setPw")}
        </Button>
      </div>
      <div className="rounded-xl border p-4 space-y-2">
        <p className="text-sm font-semibold">{t("settings.security.sessionsTitle")}</p>
        <p className="text-xs text-muted-foreground">
          {t("settings.security.sessionsDesc")}
        </p>
        <Button type="button" variant="outline" onClick={handleSignOutAll} disabled={signingOut}>
          {signingOut ? <Spinner size="sm" className="me-1" /> : null}
          {t("settings.security.signOutAll")}
        </Button>
      </div>
    </div>
  );
}
