import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { dbError } from "@/lib/api-error";

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
      return NextResponse.json(dbError("workout-feedback", cErr), { status: 400 });
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
  if (mErr) return NextResponse.json(dbError("workout-feedback", mErr), { status: 400 });

  // Keep the conversation preview in sync, mirroring what the mobile app does.
  // API-06: the unread bump used to be a read-modify-write
  // (SELECT client_unread → UPDATE client_unread = old + 1), which silently
  // lost increments when the mobile app wrote concurrently. The
  // bump_conversation_unread RPC (supabase/remediation-2026-09-28) performs a
  // single atomic `client_unread = client_unread + 1`. Until that migration is
  // applied the RPC is missing (Postgres 42883) and we fall back to the legacy
  // path so the endpoint never hard-fails.
  const preview = {
    last_message: content.slice(0, 500),
    last_message_at: new Date().toISOString(),
  };
  const { error: bumpErr } = await svc.rpc("bump_conversation_unread", {
    p_conversation_id: conversationId,
    p_for_coach: false,
  });
  if (bumpErr) {
    const code = (bumpErr as { code?: string }).code;
    if (code !== "42883" && code !== "PGRST202") {
      return NextResponse.json(dbError("workout-feedback", bumpErr), { status: 400 });
    }
    const currentUnread = existing ? ((existing as { client_unread: number | null }).client_unread ?? 0) : 0;
    await svc
      .from("conversations")
      .update({ ...preview, client_unread: currentUnread + 1 })
      .eq("id", conversationId);
  } else {
    await svc.from("conversations").update(preview).eq("id", conversationId);
  }

  return NextResponse.json({ ok: true, conversation_id: conversationId });
}
