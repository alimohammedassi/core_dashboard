"use client";

import * as React from "react";
import { Mic, Square, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

// In-browser voice note recorder (MediaRecorder). Prefers audio/mp4 (Safari —
// matches the mobile app's .m4a notes); Chrome/Edge/Firefox fall back to
// webm/opus, which iOS Flutter players may not play — documented in the
// change report as a known cross-platform consideration.
export function VoiceRecorder({
  onSend,
  onDiscard,
  disabled,
}: {
  onSend: (file: File, durationSec: number) => Promise<void>;
  onDiscard: () => void;
  disabled?: boolean;
}) {
  const [state, setState] = React.useState<"idle" | "recording" | "preview">("idle");
  const [seconds, setSeconds] = React.useState(0);
  const [blob, setBlob] = React.useState<Blob | null>(null);
  const [sending, setSending] = React.useState(false);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  function cleanupMedia() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  React.useEffect(() => cleanupMedia, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const out = new Blob(chunksRef.current, { type });
        setBlob(out);
        setState("preview");
      };
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toastMicDenied();
    }
  }

  function stopRecording(send: boolean) {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (send) {
      recorder.stop(); // onstop builds the blob and flips to preview
    } else {
      cleanupMedia();
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
      recorderRef.current = null;
      setBlob(null);
      setSeconds(0);
      setState("idle");
      onDiscard();
    }
    if (send) cleanupMedia();
  }

  async function handleSend() {
    if (!blob) return;
    const duration = Math.max(1, seconds);
    const ext = blob.type.includes("mp4") || blob.type.includes("m4a") || blob.type.includes("aac") ? "m4a" : "webm";
    const file = new File([blob], `voice_note.${ext}`, { type: blob.type || "audio/webm" });
    setSending(true);
    try {
      await onSend(file, duration);
      setBlob(null);
      setSeconds(0);
      setState("idle");
    } finally {
      setSending(false);
    }
  }

  if (state === "idle") {
    return (
      <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label="Record voice note" onClick={startRecording}>
        <Mic className="size-4" />
      </Button>
    );
  }

  if (state === "recording") {
    return (
      <div className="flex items-center gap-2 rounded-full border px-3 py-1.5">
        <span className="size-2 animate-pulse rounded-full bg-destructive" aria-hidden />
        <span className="text-sm tabular-nums">{formatTime(seconds)}</span>
        <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" aria-label="Discard recording" onClick={() => stopRecording(false)}>
          <Trash2 className="size-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Stop recording" onClick={() => stopRecording(true)}>
          <Square className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full border px-3 py-1.5">
      {blob ? (
        <audio controls src={URL.createObjectURL(blob)} className="h-8 max-w-44" />
      ) : null}
      <span className="text-xs tabular-nums opacity-70">{formatTime(seconds)}</span>
      <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" aria-label="Discard" onClick={() => { setBlob(null); setSeconds(0); setState("idle"); onDiscard(); }}>
        <Trash2 className="size-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Send voice note" disabled={sending} onClick={handleSend}>
        <Send className="size-3.5" />
      </Button>
    </div>
  );
}

function toastMicDenied() {
  import("sonner").then(({ toast }) => toast.error("Microphone access is required to record a voice note."));
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? null;
}
