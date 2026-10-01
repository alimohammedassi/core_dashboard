"use client";

import * as React from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { describeError } from "@/lib/user-error";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ArrowDown, ArrowUp, Eye, FileText, Trash2, Upload } from "lucide-react";

export type CredentialType = "achievement" | "certificate";

type CredentialItem = {
  id: string;
  title: string;
  type: string;
  file_url: string;
  file_size_kb: number | null;
  sort_order: number;
};

// Achievements & certificates manager — reuses the EXISTING coach_content
// table (coach_id FK, manage-own RLS) and the coach-media bucket (each coach
// writes their own {uid}/ folder). No new tables or buckets.
function makeStoragePath(userId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-]+/g, "_");
  return `${userId}/${Date.now()}_${safe}`;
}

export function CredentialsManager({
  coachId,
  userId,
  type,
  accept,
  emptyText,
}: {
  coachId: string;
  userId: string;
  type: CredentialType;
  accept: string;
  emptyText: string;
}) {
  const { t, fmt } = useI18n();
  const supabase = React.useMemo(() => createClient(), []);
  const [items, setItems] = React.useState<CredentialItem[]>([]);
  const [loading, setLoading] = React.useState(true); // initial load
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [newTitle, setNewTitle] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("coach_content")
      .select("id, title, type, file_url, file_size_kb, sort_order")
      .eq("coach_id", coachId)
      .eq("type", type)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) toast.error(describeError(error, t("settings.professional.credentials.genericError")));
    setItems((data ?? []) as CredentialItem[]);
    setLoading(false);
  }, [supabase, coachId, type, t]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("coach_content")
        .select("id, title, type, file_url, file_size_kb, sort_order")
        .eq("coach_id", coachId)
        .eq("type", type)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (!cancelled) {
        if (error) toast.error(describeError(error, t("settings.professional.credentials.genericError")));
        setItems((data ?? []) as CredentialItem[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, coachId, type, t]);

  function uploadWithProgress(
    path: string,
    file: File,
    onProgress: (pct: number) => void
  ): Promise<{ publicUrl: string; sizeKb: number }> {
    return new Promise((resolve, reject) => {
      supabase.auth.getSession().then(({ data }) => {
        const token = data.session?.access_token ?? "";
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/coach-media/${path}`);
        xhr.setRequestHeader("authorization", `Bearer ${token}`);
        xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
        xhr.setRequestHeader("x-upsert", "true");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const { data } = supabase.storage.from("coach-media").getPublicUrl(path);
            resolve({ publicUrl: data.publicUrl, sizeKb: Math.round(file.size / 1024) });
          } else {
            let msg = t("settings.professional.credentials.uploadFailed");
            try {
              msg = JSON.parse(xhr.responseText)?.message ?? msg;
            } catch {}
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error(t("settings.professional.credentials.connectionFailed")));
        xhr.send(file);
      }).catch(reject);
    });
  }

  async function handleUpload(file: File) {
    const isPdf = file.type === "application/pdf";
    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (!isPdf && !isImage) {
      toast.error(t("settings.professional.credentials.wrongType"));
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error(t("settings.professional.credentials.tooLarge"));
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const path = makeStoragePath(userId, file.name);
      const { publicUrl, sizeKb } = await uploadWithProgress(path, file, setProgress);
      const { error } = await supabase.from("coach_content").insert({
        coach_id: coachId,
        title: newTitle.trim() || file.name.replace(/\.[^.]+$/, ""),
        description: null,
        type,
        file_url: publicUrl,
        is_public: true,
        file_size_kb: sizeKb,
        sort_order: items.length,
      });
      if (error) throw new Error(describeError(error, t("settings.professional.credentials.requestFailed")));
      toast.success(t("settings.professional.credentials.uploaded"));
      setNewTitle("");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.professional.credentials.uploadFailed"));
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove(item: CredentialItem) {
    if (!window.confirm(t("settings.professional.credentials.removeConfirm", { title: item.title }))) return;
    setBusyId(item.id);
    try {
      const marker = item.file_url.split("?")[0].split("/coach-media/")[1];
      if (marker) await supabase.storage.from("coach-media").remove([decodeURIComponent(marker)]);
      const { error } = await supabase.from("coach_content").delete().eq("id", item.id);
      if (error) throw new Error(describeError(error, t("settings.professional.credentials.requestFailed")));
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success(t("settings.professional.credentials.removed"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.professional.credentials.removeFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReplace(item: CredentialItem, file: File) {
    setBusyId(item.id);
    try {
      const path = makeStoragePath(userId, file.name);
      const { publicUrl } = await uploadWithProgress(path, file, () => {});
      const marker = item.file_url.split("?")[0].split("/coach-media/")[1];
      if (marker) await supabase.storage.from("coach-media").remove([decodeURIComponent(marker)]);
      const { error } = await supabase
        .from("coach_content")
        .update({ file_url: publicUrl, file_size_kb: Math.round(file.size / 1024) })
        .eq("id", item.id);
      if (error) throw new Error(describeError(error, t("settings.professional.credentials.requestFailed")));
      await load();
      toast.success(t("settings.professional.credentials.replaced"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.professional.credentials.replaceFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...items];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    setBusyId(next[index].id);
    try {
      await Promise.all(
        next.map((item, i) =>
          supabase.from("coach_content").update({ sort_order: i }).eq("id", item.id)
        )
      );
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.professional.credentials.reorderFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`cm-title-${type}`}>{t("settings.professional.credentials.title")}</Label>
        <Input
          id={`cm-title-${type}`}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={t(
            type === "achievement"
              ? "settings.professional.credentials.titlePlaceholderAchievement"
              : "settings.professional.credentials.titlePlaceholderCertificate"
          )}
          className="h-10 bg-background px-3 text-body-md"
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="w-full"
      >
        {uploading ? (
          <>
            <Spinner size="sm" className="me-1" /> {t("settings.professional.credentials.uploading", { n: progress })}
          </>
        ) : (
          <>
            <Upload className="me-1 size-3.5" /> {t(type === "achievement" ? "settings.professional.credentials.uploadAchievement" : "settings.professional.credentials.uploadCertificate")}
          </>
        )}
      </Button>
      {uploading && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("common.state.loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => {
            const isPdf = item.file_url.toLowerCase().includes(".pdf");
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg bg-secondary p-3 transition-colors hover:bg-accent"
              >
                {isPdf ? (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded bg-accent">
                    <FileText className="size-4 text-primary" aria-hidden="true" />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- dynamic public user-upload URL
                  <img
                    src={item.file_url}
                    alt={item.title}
                    className="size-8 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-label-lg text-foreground">{item.title}</span>
                    <span className="inline-flex shrink-0 rounded bg-mint/15 px-2 py-0.5 text-label-sm text-mint">
                      {isPdf ? t("settings.professional.credentials.pdf") : t("settings.professional.credentials.image")}
                    </span>
                  </p>
                  <p className="truncate text-body-sm text-faint">
                    {item.file_size_kb ? t("settings.professional.credentials.sizeKb", { n: fmt.num(item.file_size_kb) }) : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {/* Honest visibility check: the file really opens at its public URL */}
                  <a
                    href={item.file_url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("settings.professional.credentials.openFile")}
                    title={t("settings.professional.credentials.openFile")}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Eye className="size-3.5" aria-hidden="true" />
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={t("settings.professional.credentials.moveUp")}
                    disabled={i === 0 || busyId !== null}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={t("settings.professional.credentials.moveDown")}
                    disabled={i === items.length - 1 || busyId !== null}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <label className="cursor-pointer" title={t("settings.professional.credentials.replaceFile")}>
                    <input
                      type="file"
                      accept={accept}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleReplace(item, f);
                      }}
                    />
                    <span className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                      {busyId === item.id ? <Spinner size="sm" /> : <Upload className="size-3.5" />}
                    </span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive"
                    aria-label={t("settings.professional.credentials.removeAria", { title: item.title })}
                    disabled={busyId !== null}
                    onClick={() => handleRemove(item)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
