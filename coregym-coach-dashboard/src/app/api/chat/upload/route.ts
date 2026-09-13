import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { chatBucketFor, CHAT_MEDIA_LIMITS, type ChatMediaType } from "@/lib/chat-media";

// Coach-side chat media upload. Matches the mobile app's conventions exactly
// (path "{conversationId}/{millis}_{name}", file_url = path without bucket,
// content = "" | duration-seconds | {"name","size"} JSON) so both apps can
// read each other's messages. Flow: authenticate → participant check →
// server-side size/MIME validation → storage upload → messages insert.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file"; // strip any path components
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]+/g, "").trim();
  return cleaned || "file";
}

function extFromMime(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "webm"; // MediaRecorder default (webm/opus)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload" }, { status: 400 });
  }

  const conversationId = String(form.get("conversationId") ?? "");
  const type = String(form.get("type") ?? "") as ChatMediaType;
  const durationRaw = form.get("duration");
  const file = form.get("file");

  if (!UUID_RE.test(conversationId)) {
    return NextResponse.json({ error: "A valid conversation is required" }, { status: 400 });
  }
  if (type !== "image" && type !== "voice" && type !== "file") {
    return NextResponse.json({ error: "Attachment type must be image, voice or file" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to attach" }, { status: 400 });
  }

  const limits = CHAT_MEDIA_LIMITS[type];
  if (file.size > limits.maxBytes) {
    const mb = Math.round(limits.maxBytes / (1024 * 1024));
    return NextResponse.json(
      { error: `That ${type} is too large — the limit is ${mb} MB.` },
      { status: 400 }
    );
  }
  // MIME is client-supplied, so this is a sanity gate (right major type),
  // not a security boundary — the real boundary is the participant check.
  if (limits.mimes && file.type && !limits.mimes.some((m) => file.type === m || file.type.startsWith(m))) {
    return NextResponse.json(
      { error: `Unsupported ${type} format (${file.type || "unknown"}).` },
      { status: 400 }
    );
  }
  if (limits.blockExts) {
    const lower = sanitizeFilename(file.name).toLowerCase();
    if (limits.blockExts.some((ext) => lower.endsWith(ext))) {
      return NextResponse.json({ error: "That file type cannot be sent in chat." }, { status: 400 });
    }
  }

  // Participant check — the dashboard is coach-only; the client side of this
  // check mirrors the storage policies for completeness.
  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .or(`coach_id.eq.${user.id},client_id.eq.${user.id}`)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "You are not a participant in this conversation" }, { status: 403 });
  }

  const svc = await createServiceClient();
  const bucket = chatBucketFor(type);
  if (!bucket) {
    return NextResponse.json({ error: "Chat storage is not configured." }, { status: 500 });
  }
  const safeName = sanitizeFilename(file.name);

  let path: string;
  if (type === "voice") {
    // mobile convention: {conversationId}/{millis}_chat_voice_{millis}.{ext}
    const now = Date.now();
    path = `${conversationId}/${now}_chat_voice_${now}.${extFromMime(file.type || "audio/webm")}`;
  } else {
    path = `${conversationId}/${Date.now()}_${safeName}`;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await svc.storage.from(bucket).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: "Upload failed — please try again." }, { status: 500 });
  }

  // content conventions match the mobile app exactly:
  //   image → ""   voice → duration in seconds   file → {"name","size"} JSON
  let content = "";
  if (type === "voice") {
    content = String(Math.max(1, Math.round(Number(durationRaw) || 1)));
  } else if (type === "file") {
    content = JSON.stringify({ name: safeName, size: file.size });
  }

  const { data: message, error: msgErr } = await svc
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, content, type, file_url: path })
    .select()
    .single();
  if (msgErr || !message) {
    // don't leave an orphaned object behind if the message insert fails
    await svc.storage.from(bucket).remove([path]);
    return NextResponse.json({ error: msgErr?.message ?? "Could not send the attachment" }, { status: 500 });
  }

  // keep the conversation preview fresh, same as the text send path
  await svc.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);

  return NextResponse.json(message);
}
