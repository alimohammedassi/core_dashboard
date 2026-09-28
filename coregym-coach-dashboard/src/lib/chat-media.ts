// Chat media conventions + limits. Paths, buckets, content shapes and the
// file_url format mirror what the mobile app already writes (verified against
// live storage.objects rows) so both apps can read each other's messages.

export type ChatMediaType = "image" | "voice" | "file";

export const CHAT_MEDIA_BUCKETS: Record<ChatMediaType, string> = {
  image: "chat-images",
  voice: "chat-voice-notes",
  file: "chat-files",
};

// CFG-05: the server previously accepted 10/25 MB, but the Vercel request-body
// ceiling (~4.5 MB) makes anything larger unreachable in production — the
// request fails during body parsing with a generic platform error before this
// route even runs. The caps now match what the platform can actually deliver,
// with honest error messages. Viewing larger files the mobile app already sent
// is unaffected (limits only gate uploads). If bigger uploads are ever needed,
// switch to direct-to-storage signed uploads (prepared architecture note in
// the remediation report) instead of raising these numbers.
const PLATFORM_BODY_CAP = 4 * 1024 * 1024 + 400 * 1024; // ~4.4 MB, under the ~4.5 MB platform ceiling

// Adjustable limits — the storage buckets themselves have no size/MIME
// restrictions, so these server-side rules are the only guardrail.
export const CHAT_MEDIA_LIMITS: Record<
  ChatMediaType,
  { maxBytes: number; mimes?: string[]; blockExts?: string[] }
> = {
  image: {
    maxBytes: PLATFORM_BODY_CAP,
    mimes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"],
  },
  voice: {
    maxBytes: PLATFORM_BODY_CAP,
    mimes: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/wav", "audio/x-m4a", "audio/m4a", "audio/aac"],
  },
  file: {
    maxBytes: PLATFORM_BODY_CAP,
    // SEC-02: active-content formats are blocked — a signed chat-files URL
    // must never be able to render HTML/SVG on the storage origin.
    blockExts: [".exe", ".msi", ".bat", ".cmd", ".sh", ".scr", ".apk", ".html", ".htm", ".svg", ".xhtml", ".shtml"],
  },
};

// Signed URLs live long enough to outlast an active conversation view but are
// not standing public links. MediaMessage refetches on error, so expiry is
// self-healing.
export const CHAT_SIGNED_URL_TTL = 15 * 60; // 15 minutes, in seconds

export function chatBucketFor(type: string): string | null {
  return (CHAT_MEDIA_BUCKETS as Record<string, string>)[type] ?? null;
}

// ── SEC-02: content sniffing (the client-supplied MIME type is advisory) ────

/** Magic-byte signature check for declared image uploads. */
export function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // jpeg
  if (buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return true; // png
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return true; // gif
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return true; // webp
  // HEIC/HEIF: iso brand box at offset 4
  const brand = buf.subarray(8, 12).toString("ascii").toLowerCase();
  if (brand === "heic" || brand === "heix" || brand === "mif1" || brand === "msf1") return true;
  return false;
}

/** Lenient audio check: known container magic, or at least not active text. */
export function looksLikeAudio(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return true; // mp4/m4a
  if (buf.subarray(0, 4).toString("hex") === "1a45dfa3") return true; // webm/mkv
  if (buf.subarray(0, 4).toString("ascii") === "RIFF") return true; // wav
  if (buf.subarray(0, 3).toString("ascii") === "ID3" || buf[0] === 0xff) return true; // mp3
  if (buf.subarray(0, 4).toString("ascii") === "OggS") return true; // ogg
  if (buf.subarray(0, 4).toString("ascii") === "fLaC") return true; // flac
  // Unknown binary is allowed through (mobile writes varied formats); what is
  // never allowed is text that would render as markup.
  return !looksLikeActiveText(buf);
}

/** HTML/SVG/markup detector — rejects active content masquerading as any type. */
export function looksLikeActiveText(buf: Buffer): boolean {
  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  return (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.startsWith("<svg") ||
    head.startsWith("<?xml") ||
    head.includes("<script")
  );
}
