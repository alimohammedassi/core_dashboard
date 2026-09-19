"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload, Trash2 } from "lucide-react";

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
  const supabase = React.useMemo(() => createClient(), []);
  const [url, setUrl] = React.useState<string | null>(initialUrl);
  const [uploading, setUploading] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file (JPG, PNG or WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image is too large — the limit is 5 MB.");
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
      toast.success("Profile photo updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
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
      if (error) throw new Error(error.message);
      setUrl(null);
      onSaved?.(null);
      toast.success("Profile photo removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- public avatar URL with cache-buster; next/image adds nothing
          <img src={url} alt="Profile photo" className="size-full object-cover" />
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
            {uploading ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Upload className="mr-1 size-3.5" />}
            {uploading ? "Uploading…" : url ? "Replace photo" : "Upload photo"}
          </Button>
          {url && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={removing} onClick={handleRemove}>
              {removing ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Trash2 className="mr-1 size-3.5" />}
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG or WebP · max 5 MB</p>
      </div>
    </div>
  );
}

// Change email — Supabase Auth sends a confirmation to the new address; the
// change applies after the user confirms.
export function EmailChange({ currentEmail }: { currentEmail: string }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [email, setEmail] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    const next = email.trim();
    if (!next || !next.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    if (next === currentEmail) {
      toast.info("This is already your current email");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: next });
      if (error) throw new Error(error.message);
      toast.success("Confirmation sent to your new email — the change applies after you confirm it.");
      setEmail("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not change email");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="acc-email-current">Current email</Label>
        <Input id="acc-email-current" value={currentEmail} readOnly disabled className="bg-muted/40" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="acc-email-new">New email</Label>
        <div className="flex gap-2">
          <Input id="acc-email-new" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new@email.com" />
          <Button type="button" onClick={handleSave} disabled={saving || !email.trim()}>
            {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            Update
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A confirmation link is sent to the new address. The change applies only after you confirm it.
        </p>
      </div>
    </div>
  );
}

// Change password + sign out everywhere — real Supabase Auth operations.
export function SecurityControls() {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleChangePassword() {
    if (pw.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (pw !== pw2) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw new Error(error.message);
      toast.success("Password updated");
      setPw("");
      setPw2("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOutAll() {
    if (!window.confirm("Sign out of CoreGym on ALL devices (phone and any other browsers)?")) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw new Error(error.message);
      router.replace("/login");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sign out failed");
      setSigningOut(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Label htmlFor="sec-pw">New password</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input id="sec-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} placeholder="New password (min 8 chars)" />
          <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm new password" />
        </div>
        <Button type="button" onClick={handleChangePassword} disabled={saving || pw.length < 8 || pw !== pw2}>
          {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
          Update password
        </Button>
      </div>
      <div className="rounded-xl border p-4 space-y-2">
        <p className="text-sm font-semibold">Active sessions</p>
        <p className="text-xs text-muted-foreground">
          Signing out everywhere ends this browser session and every mobile app / other browser session for your account.
        </p>
        <Button type="button" variant="outline" onClick={handleSignOutAll} disabled={signingOut}>
          {signingOut ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
          Sign out of all devices
        </Button>
      </div>
    </div>
  );
}
