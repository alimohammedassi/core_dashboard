import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { chatBucketFor, CHAT_SIGNED_URL_TTL } from "@/lib/chat-media";
import { dbError } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH_LIMIT = 50;

// Signed URLs for chat attachments. The three chat buckets are PRIVATE, so the
// dashboard can never build a direct URL — it asks this route, which verifies
// the caller is a participant of the message's conversation before minting a
// short-lived signed URL. Non-participants get 403 even if they know a
// message id.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // API-05: signed-URL minting per thread open — 30/min per user/instance is
  // far above legitimate prefetch traffic but caps scripted enumeration.
  if (rateLimit(`chat-att:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests — please wait a moment" }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { messageId?: string; messageIds?: unknown } | null;

  // P4 batch path: one call mints URLs for a whole thread's media messages
  // (the dashboard prefetches on conversation open). Same participant rule
  // per message — a single non-participant id fails the whole batch.
  if (Array.isArray(body?.messageIds)) {
    const ids = body.messageIds.map(String).filter((id) => UUID_RE.test(id)).slice(0, BATCH_LIMIT);
    if (ids.length === 0) return NextResponse.json({ error: "messageIds must be a non-empty id list" }, { status: 400 });
    const svc = await createServiceClient();
    const { data: rows, error: rowsErr } = await svc
      .from("messages")
      .select("id, conversation_id, type, file_url")
      .in("id", ids);
    if (rowsErr) return NextResponse.json(dbError("chat/attachments", rowsErr), { status: 400 });
    const msgs = (rows ?? []) as { id: string; conversation_id: string; type: string | null; file_url: string | null }[];
    if (msgs.length !== ids.length) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    const convIds = [...new Set(msgs.map((m) => m.conversation_id))];
    const { data: convs, error: convsErr } = await svc
      .from("conversations")
      .select("id")
      .in("id", convIds)
      .or(`coach_id.eq.${user.id},client_id.eq.${user.id}`);
    if (convsErr) return NextResponse.json(dbError("chat/attachments", convsErr), { status: 400 });
    if ((convs ?? []).length !== convIds.length) {
      return NextResponse.json({ error: "You are not a participant in this conversation" }, { status: 403 });
    }
    const urls: Record<string, string> = {};
    await Promise.all(
      msgs.map(async (m) => {
        const bucket = chatBucketFor(m.type ?? "");
        if (!bucket || !m.file_url) return;
        // SEC-02: file downloads are forced to attachment semantics so nothing
        // from the chat-files bucket renders inline on the storage origin.
        const { data } = await svc.storage.from(bucket).createSignedUrl(m.file_url, CHAT_SIGNED_URL_TTL, {
          download: bucket === "chat-files",
        });
        if (data?.signedUrl) urls[m.id] = data.signedUrl;
      })
    );
    return NextResponse.json({ urls, expiresIn: CHAT_SIGNED_URL_TTL });
  }

  const messageId = body?.messageId ?? "";
  if (!messageId || !UUID_RE.test(messageId)) {
    return NextResponse.json({ error: "messageId must be a valid id" }, { status: 400 });
  }

  const svc = await createServiceClient();
  const { data: message } = await svc
    .from("messages")
    .select("conversation_id, type, file_url")
    .eq("id", messageId)
    .maybeSingle();
  if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  const msg = message as { conversation_id: string; type: string | null; file_url: string | null };
  const bucket = chatBucketFor(msg.type ?? "");
  if (!bucket || !msg.file_url) {
    return NextResponse.json({ error: "This message has no attachment" }, { status: 400 });
  }

  // Participant check: the dashboard is coach-only, but the check is
  // participant-based (coach OR client) so the contract matches the storage
  // policies and the mobile app.
  const { data: conv } = await svc
    .from("conversations")
    .select("id")
    .eq("id", msg.conversation_id)
    .or(`coach_id.eq.${user.id},client_id.eq.${user.id}`)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "You are not a participant in this conversation" }, { status: 403 });
  }

  const { data, error } = await svc.storage.from(bucket).createSignedUrl(msg.file_url, CHAT_SIGNED_URL_TTL, {
    download: bucket === "chat-files",
  });
  if (error || !data) {
    return NextResponse.json({ error: "Could not generate attachment link" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, expiresIn: CHAT_SIGNED_URL_TTL, bucket });
}
