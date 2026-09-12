import { createClient } from "@/lib/supabase/server";
import { ChatClient } from "@/components/chat/ChatClient";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  let initial: never[] = [];
  let coachId = user.id;

  try {
    const { data, error } = await supabase
      .from("conversations")
      .select(
        `
        *,
        client:profiles!conversations_client_id_fkey(id, full_name, avatar_url, email),
        messages!messages_conversation_id_fkey(id, content, created_at, sender_id, read)
      `
      )
      .eq("coach_id", coachId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50);

    if (!error && data) {
      // attach last_message + unread_count per conversation
      const enriched = (data as unknown as Array<Record<string, unknown> & { messages: Array<{ created_at: string; read: boolean; sender_id: string; content: string }> }>).map(
        (c) => {
          const msgs = (c.messages as unknown[]) ?? [];
          const sorted = [...(msgs as Array<{ created_at: string }>)].sort(
            (a, b) => +new Date(a.created_at) - +new Date(b.created_at)
          );
          const last = sorted[sorted.length - 1] as unknown;
          const unread = (msgs as Array<{ read: boolean; sender_id: string }>).filter((m) => !m.read && m.sender_id !== coachId)
            .length;
          return { ...c, last_message: last ?? null, unread_count: unread };
        }
      );
      initial = enriched as never[];
    }
  } catch {
    // fallback to mock inside client
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
      <p className="text-sm text-muted-foreground">
        Same conversations as the mobile app. Realtime via <code className="font-mono">messages</code> table. Mirrors
        Flutter chat with no changes needed there.
      </p>
      <ChatClient coachId={coachId} initialConversations={initial as never} />
    </div>
  );
}
