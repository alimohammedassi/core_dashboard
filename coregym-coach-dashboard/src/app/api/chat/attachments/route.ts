import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { chatBucketFor, CHAT_SIGNED_URL_TTL } from "@/lib/chat-media";

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

  const body = (await req.json().catch(() => null)) as { messageId?: string } | null;
  const messageId = body?.messageId ?? "";
  if (!messageId) return NextResponse.json({ error: "messageId is required" }, { status: 400 });

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

  const { data, error } = await svc.storage.from(bucket).createSignedUrl(msg.file_url, CHAT_SIGNED_URL_TTL);
  if (error || !data) {
    return NextResponse.json({ error: "Could not generate attachment link" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, expiresIn: CHAT_SIGNED_URL_TTL, bucket });
}
