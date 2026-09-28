import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { enrichConversationUnread } from "@/lib/chat-unread";
import { ChatClient } from "@/components/chat/ChatClient";

export default async function ChatPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return null;

  // conversations.coach_id is the auth user id
  const coachId = user.id;

  let initial: never[] = [];

  try {
    // Embed ONLY each conversation's latest message (bounded — the full
    // history made this payload grow linearly with total messages; the
    // selected thread is fetched separately by ChatClient). `type` is
    // included because the preview renderer needs it for media messages.
    const { data, error } = await supabase
      .from("conversations")
      .select(
        `
        *,
        client:profiles!conversations_client_id_fkey(id, full_name, avatar_url, email),
        messages(id, content, type, created_at, sender_id, is_read)
      `
      )
      .eq("coach_id", coachId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, referencedTable: "messages" })
      .limit(1, { referencedTable: "messages" })
      .limit(50);

    if (!error && data) {
      // attach last_message + unread_count per conversation (pure helper —
      // unit-tested in tests/chat-unread.test.ts)
      const enriched = (data as unknown as Array<Record<string, unknown>>).map((c) =>
        enrichConversationUnread(c, coachId)
      );
      initial = enriched as never[];
    }
  } catch {
    // render with empty list
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Chat</h1>
      <p className="text-sm text-muted-foreground">
        Same conversations as the mobile app. Realtime via <code className="font-mono">messages</code> table. Mirrors
        Flutter chat with no changes needed there.
      </p>
      <ChatClient coachId={coachId} initialConversations={initial as never} />
    </div>
  );
}
