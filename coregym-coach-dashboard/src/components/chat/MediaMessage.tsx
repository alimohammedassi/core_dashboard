"use client";

import * as React from "react";
import { X, FileDown, ImageIcon, AudioLines, FileQuestion } from "lucide-react";
import type { Message } from "@/lib/supabase/types";
import type { TFn } from "@/lib/i18n/dictionary";
import type { Formatters } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/client";
import { toast } from "sonner";

// Renders a non-text chat message (image | voice | file). Signed URLs are
// minted per message by /api/chat/attachments (participant-verified,
// short-lived); the open thread prefetches them in one batch call and passes
// them via prefetchedSrc — the single fetch below is the fallback for new
// arrivals and expired URLs. If one expires mid-session the next media error
// refetches it.
export function MediaMessage({ message, prefetchedSrc }: { message: Message; prefetchedSrc?: string }) {
  const { t, fmt } = useI18n();
  const [src, setSrc] = React.useState<string | null>(prefetchedSrc ?? null);
  const [failed, setFailed] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(false);
  const retried = React.useRef(false);

  // Adopt prefetched URLs when the batch resolves after first render.
  React.useEffect(() => {
    if (prefetchedSrc && !retried.current) {
      setSrc(prefetchedSrc);
      setFailed(false);
    }
  }, [prefetchedSrc]);

  React.useEffect(() => {
    if (src) return; // already resolved (prefetch or previous fetch)
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: message.id }),
        });
        const b = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && b.url) {
          setSrc(b.url);
          setFailed(false);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [message.id, src]);

  // media elements call this when the signed URL has expired or the object is
  // unreadable — refetch once before giving up
  const reRefetch = React.useCallback(() => {
    if (retried.current) {
      setFailed(true);
      setSrc(null);
      return;
    }
    retried.current = true;
    setSrc(null);
  }, []);

  if (failed) {
    return (
      <span className="flex items-center gap-1.5 rounded-md bg-black/10 px-2 py-1.5 text-xs">
        <FileQuestion className="size-3.5" /> {t("chat.media.unavailable")}
      </span>
    );
  }

  if (message.type === "image") {
    return (
      <>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, expiring URL; next/image adds no value
          <img
            src={src}
            alt={message.content || t("chat.media.imageAlt")}
            onError={reRefetch}
            onClick={() => setLightbox(true)}
            className="max-h-56 w-auto cursor-zoom-in rounded-lg"
          />
        ) : (
          <ImagePlaceholder />
        )}
        {lightbox && src && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
            onClick={() => setLightbox(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
            <img src={src} alt={message.content || t("chat.media.imageAlt")} className="max-h-full max-w-full rounded-lg" />
            <button
              type="button"
              aria-label={t("common.actions.close")}
              className="absolute end-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X className="size-5" />
            </button>
          </div>
        )}
      </>
    );
  }

  if (message.type === "voice") {
    const seconds = Math.max(1, Math.round(Number(message.content) || 0));
    return (
      <div className="flex min-w-52 items-center gap-2">
        <AudioLines className="size-4 shrink-0 opacity-70" />
        {src ? (
          <audio controls preload="metadata" src={src} onError={reRefetch} className="h-8 max-w-52" />
        ) : (
          <span className="text-xs opacity-70">{t("chat.media.loadingVoice")}</span>
        )}
        <span className="text-xs opacity-70">{t("chat.media.seconds", { s: seconds })}</span>
      </div>
    );
  }

  // file
  let fileInfo: { name: string; size?: number } | null = null;
  try {
    const parsed = JSON.parse(message.content);
    if (parsed && typeof parsed === "object" && parsed.name) fileInfo = parsed;
  } catch {
    /* not JSON — fall back to the path's filename */
  }
  const fileName = fileInfo?.name ?? message.file_url?.split("/").pop() ?? t("chat.media.fileFallback");
  return (
    <a
      href={src ?? undefined}
      download={fileName}
      onClick={(e) => {
        if (!src) e.preventDefault();
      }}
      className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 transition-colors hover:bg-black/20"
    >
      <FileDown className="size-4 shrink-0" />
      <span className="min-w-0">
        <span className="block max-w-52 truncate text-sm font-medium">{fileName}</span>
        <span className="block text-xs opacity-70">
          {fileInfo?.size != null ? `${formatSize(fileInfo.size, fmt)} · ` : ""}
          {src ? t("chat.media.clickToDownload") : t("chat.media.preparing")}
        </span>
      </span>
    </a>
  );
}

function formatSize(bytes: number, fmt: Formatters): string {
  if (bytes < 1024) return `${fmt.num(bytes)} B`;
  if (bytes < 1024 * 1024) return `${fmt.num(bytes / 1024, { maximumFractionDigits: 0 })} KB`;
  return `${fmt.num(bytes / (1024 * 1024), { maximumFractionDigits: 1 })} MB`;
}

function ImagePlaceholder() {
  const { t } = useI18n();
  return (
    <span className="flex h-32 w-48 items-center justify-center gap-2 rounded-lg bg-black/10 text-xs opacity-70">
      <ImageIcon className="size-4" /> {t("chat.media.loadingImage")}
    </span>
  );
}

// Friendly conversation-list preview for non-text messages. Takes the active
// t() so previews follow the dashboard language.
export function messagePreview(m: Message | null | undefined, t: TFn): string {
  if (!m) return t("chat.media.previewNone");
  switch (m.type) {
    case "image":
      return t("chat.media.previewPhoto");
    case "voice": {
      const s = Math.max(1, Math.round(Number(m.content) || 0));
      return t("chat.media.previewVoice", { s });
    }
    case "file": {
      let name = t("chat.media.fileFallback");
      try {
        const parsed = JSON.parse(m.content);
        if (parsed?.name) name = parsed.name;
      } catch {
        /* keep default */
      }
      return t("chat.media.previewFile", { name });
    }
    case "workout_plan":
      return t("chat.media.previewWorkout");
    case "nutrition_plan":
      return t("chat.media.previewNutrition");
    default:
      return m.content || t("chat.media.previewMessage");
  }
}

// Toast helper for consistent media failure reporting.
export function mediaErrorToast(err: unknown, fallback: string) {
  toast.error(err instanceof Error ? err.message : fallback);
}
