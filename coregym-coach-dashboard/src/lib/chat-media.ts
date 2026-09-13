// Chat media conventions + limits. Paths, buckets, content shapes and the
// file_url format mirror what the mobile app already writes (verified against
// live storage.objects rows) so both apps can read each other's messages.

export type ChatMediaType = "image" | "voice" | "file";

export const CHAT_MEDIA_BUCKETS: Record<ChatMediaType, string> = {
  image: "chat-images",
  voice: "chat-voice-notes",
  file: "chat-files",
};

// Adjustable limits — the storage buckets themselves have no size/MIME
// restrictions, so these server-side rules are the only guardrail. Deliberately
// stricter than the (unlimited) mobile side for images/voice; a limit here
// never blocks VIEWING a larger file the mobile app already sent.
export const CHAT_MEDIA_LIMITS: Record<
  ChatMediaType,
  { maxBytes: number; mimes?: string[]; blockExts?: string[] }
> = {
  image: {
    maxBytes: 10 * 1024 * 1024, // 10 MB
    mimes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"],
  },
  voice: {
    maxBytes: 25 * 1024 * 1024, // 25 MB ≈ hours of opus; browsers record short notes
    mimes: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/wav", "audio/x-m4a", "audio/m4a", "audio/aac"],
  },
  file: {
    maxBytes: 25 * 1024 * 1024, // 25 MB; mobile applies no restriction — viewing is unaffected
    blockExts: [".exe", ".msi", ".bat", ".cmd", ".sh", ".scr", ".apk"],
  },
};

// Signed URLs live long enough to outlast an active conversation view but are
// not standing public links. MediaMessage refetches on error, so expiry is
// self-healing.
export const CHAT_SIGNED_URL_TTL = 15 * 60; // 15 minutes, in seconds

export function chatBucketFor(type: string): string | null {
  return (CHAT_MEDIA_BUCKETS as Record<string, string>)[type] ?? null;
}
