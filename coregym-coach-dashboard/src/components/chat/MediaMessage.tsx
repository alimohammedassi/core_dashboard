"use client";

import * as React from "react";
import {
  X,
  FileDown,
  ImageIcon,
  AudioLines,
  FileQuestion,
  Play,
  Pause,
  Camera,
  ArrowDownToLine,
} from "lucide-react";
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
          <div className="group relative w-80 max-w-full overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring URL; next/image adds no value */}
            <img
              src={src}
              alt={message.content || t("chat.media.imageAlt")}
              onError={reRefetch}
              onClick={() => setLightbox(true)}
              className="h-48 w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {/* Real caption from message.content (the upload API stores "" for
                plain photos, so the strip degrades to just the icon). */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-background/90 to-transparent p-3 pt-8">
              <Camera className="size-4 shrink-0 text-primary" />
              {message.content ? (
                <span className="truncate text-[13px] font-semibold text-white">{message.content}</span>
              ) : null}
            </div>
          </div>
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
    // content convention (shared with the mobile app): duration in seconds.
    const seconds = Math.max(1, Math.round(Number(message.content) || 0));
    return <VoiceCard src={src} seconds={seconds} onMediaError={reRefetch} />;
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
      className="flex w-80 max-w-full items-center justify-between gap-3 rounded-xl bg-background/80 p-2.5 transition-colors hover:bg-accent"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          <FileDown className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-label-md font-semibold text-foreground">{fileName}</span>
          <span className="block truncate text-[11px] text-faint">
            {fileInfo?.size != null ? `${formatSize(fileInfo.size, fmt)} · ` : ""}
            {src ? t("chat.media.clickToDownload") : t("chat.media.preparing")}
          </span>
        </span>
      </span>
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
        <ArrowDownToLine className="size-4" />
      </span>
    </a>
  );
}

/* Stitch voice card: 36px volt play button + 19-bar waveform driven by a
   hidden <audio> element. Playback progress paints bars volt; the rest stay
   graphite. Duration comes from message.content (real seconds). */
const BAR_HEIGHTS = [8, 20, 12, 28, 16, 24, 10, 22, 14, 26, 12, 18, 28, 10, 22, 14, 24, 12, 8];

function VoiceCard({ src, seconds, onMediaError }: { src: string | null; seconds: number; onMediaError: () => void }) {
  const { t } = useI18n();
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [played, setPlayed] = React.useState(0); // 0..1

  const playedBars = Math.round(played * BAR_HEIGHTS.length);

  function togglePlay() {
    const el = audioRef.current;
    if (!el || !src) return;
    if (playing) {
      el.pause();
    } else {
      void el.play().catch(() => setPlaying(false));
    }
  }

  return (
    <div className="w-80 max-w-full">
      <div className="flex items-center gap-2 pb-1.5">
        <AudioLines className="size-4 shrink-0 text-primary" />
        <span className="text-label-sm font-semibold text-foreground">{t("chat.media.voiceNote")}</span>
        <span className="ms-auto rounded bg-accent px-1.5 py-0.5 text-[11px] tabular-nums text-primary">
          {formatDuration(seconds)}
        </span>
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-background/80 p-2.5">
        {src ? (
          <>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? t("chat.media.pause") : t("chat.media.play")}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground glow-volt transition-transform hover:scale-105 active:scale-95"
            >
              {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
            </button>
            <div className="flex h-8 min-w-0 flex-1 items-center gap-[3px]">
              {BAR_HEIGHTS.map((h, i) => (
                <span
                  key={i}
                  className={`w-1 shrink-0 rounded-full transition-colors ${
                    i < playedBars ? "bg-primary" : "bg-border"
                  }`}
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
            <audio
              ref={audioRef}
              src={src}
              preload="metadata"
              onError={onMediaError}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                setPlayed(0);
              }}
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                setPlayed(Math.min(1, el.currentTime / Math.max(1, seconds)));
              }}
              className="hidden"
            />
          </>
        ) : (
          <>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-faint">
              <AudioLines className="size-4" />
            </span>
            <span className="min-w-0 flex-1 text-body-sm text-faint">{t("chat.media.loadingVoice")}</span>
          </>
        )}
      </div>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes: number, fmt: Formatters): string {
  if (bytes < 1024) return `${fmt.num(bytes)} B`;
  if (bytes < 1024 * 1024) return `${fmt.num(bytes / 1024, { maximumFractionDigits: 0 })} KB`;
  return `${fmt.num(bytes / (1024 * 1024), { maximumFractionDigits: 1 })} MB`;
}

function ImagePlaceholder() {
  const { t } = useI18n();
  return (
    <span className="flex h-48 w-80 max-w-full items-center justify-center gap-2 rounded-xl bg-black/10 text-xs opacity-70">
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
