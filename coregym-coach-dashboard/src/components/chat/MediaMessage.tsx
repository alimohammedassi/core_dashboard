"use client";

import * as React from "react";
import { X, FileDown, ImageIcon, AudioLines, FileQuestion } from "lucide-react";
import type { Message } from "@/lib/supabase/types";
import { toast } from "sonner";

// Renders a non-text chat message (image | voice | file). Signed URLs are
// minted per message by /api/chat/attachments (participant-verified,
// short-lived); if one expires mid-session the next media error refetches it.
export function MediaMessage({ message }: { message: Message }) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(false);
  const retried = React.useRef(false);

  React.useEffect(() => {
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
  }, [message.id]);

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
        <FileQuestion className="size-3.5" /> Attachment unavailable
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
            alt={message.content || "Shared image"}
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
            <img src={src} alt={message.content || "Shared image"} className="max-h-full max-w-full rounded-lg" />
            <button
              type="button"
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
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
          // eslint-disable-next-line jsx-a11y/media-has-caption -- short voice notes have no transcript track
          <audio controls preload="metadata" src={src} onError={reRefetch} className="h-8 max-w-52" />
        ) : (
          <span className="text-xs opacity-70">Loading voice note…</span>
        )}
        <span className="text-xs opacity-70">{seconds}s</span>
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
  const fileName = fileInfo?.name ?? message.file_url?.split("/").pop() ?? "File";
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
          {fileInfo?.size != null ? `${formatSize(fileInfo.size)} · ` : ""}
          {src ? "Click to download" : "Preparing download…"}
        </span>
      </span>
    </a>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImagePlaceholder() {
  return (
    <span className="flex h-32 w-48 items-center justify-center gap-2 rounded-lg bg-black/10 text-xs opacity-70">
      <ImageIcon className="size-4" /> Loading image…
    </span>
  );
}

// Friendly conversation-list preview for non-text messages.
export function messagePreview(m: Message | null | undefined): string {
  if (!m) return "No messages yet";
  switch (m.type) {
    case "image":
      return "📷 Photo";
    case "voice": {
      const s = Math.max(1, Math.round(Number(m.content) || 0));
      return `🎤 Voice note (${s}s)`;
    }
    case "file": {
      let name = "File";
      try {
        const parsed = JSON.parse(m.content);
        if (parsed?.name) name = parsed.name;
      } catch {
        /* keep default */
      }
      return `📄 ${name}`;
    }
    case "workout_plan":
      return "🏋️ Workout plan";
    case "nutrition_plan":
      return "🥗 Nutrition plan";
    default:
      return m.content || "Message";
  }
}

// Toast helper for consistent media failure reporting.
export function mediaErrorToast(err: unknown) {
  toast.error(err instanceof Error ? err.message : "Attachment failed");
}
