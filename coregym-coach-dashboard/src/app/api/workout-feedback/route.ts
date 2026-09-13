import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";

// Coach feedback after a performance review. Uses the EXISTING chat system:
// finds the coach/client conversation (conversations.coach_id is the auth uid,
// matching the dashboard chat page) and inserts a message into it. The client
// receives it through the normal chat realtime flow — no new messaging system.
export async function POST(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const clientId = String(body.client_id ?? "");
  const content = String(body.content ?? "").trim();
  if (!clientId) return NextResponse.json({ error: "Client is required" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  if (content.length > 4000) return NextResponse.json({ error: "Message is too long" }, { status: 400 });

  const svc = await createServiceClient();

  // Only active subscribers of this coach can be messaged.
  const { data: sub } = await svc
    .from("subscriptions")
    .select("id")
    .eq("coach_id", ctx.coachId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .limit(1);
  if (!sub || sub.length === 0) {
    return NextResponse.json({ error: "Client must be an active subscriber of yours" }, { status: 400 });
  }

  let conversationId: string | null = null;
  const { data: existing } = await svc
    .from("conversations")
    .select("id, client_unread")
    .eq("coach_id", ctx.userId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (existing) {
    conversationId = (existing as { id: string }).id;
  } else {
    const { data: created, error: cErr } = await svc
      .from("conversations")
      .insert({ coach_id: ctx.userId, client_id: clientId, is_active: true, client_unread: 0, coach_unread: 0 })
      .select("id")
      .single();
    if (cErr || !created) {
      return NextResponse.json({ error: cErr?.message ?? "Could not open a conversation" }, { status: 400 });
    }
    conversationId = (created as { id: string }).id;
  }

  const { error: mErr } = await svc.from("messages").insert({
    conversation_id: conversationId,
    sender_id: ctx.userId,
    content,
    type: "text",
    is_read: false,
  });
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });

  // Keep the conversation preview in sync, mirroring what the mobile app does.
  const currentUnread = existing ? ((existing as { client_unread: number | null }).client_unread ?? 0) : 0;
  await svc
    .from("conversations")
    .update({
      last_message: content.slice(0, 500),
      last_message_at: new Date().toISOString(),
      client_unread: currentUnread + 1,
    })
    .eq("id", conversationId);

  return NextResponse.json({ ok: true, conversation_id: conversationId });
}
