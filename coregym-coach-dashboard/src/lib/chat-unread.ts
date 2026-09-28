// Pure conversation-list enrichment for the chat page (framework-free so
// unit tests cover the unread-badge math). Mirrors the live schema:
// conversations.coach_unread is the precomputed counter; the embedded
// latest message is the fallback source when the counter is null.
export type ChatListMessage = {
  created_at: string;
  is_read: boolean | null;
  sender_id: string;
};

export type EnrichedConversation<T extends Record<string, unknown>> = T & {
  last_message: unknown;
  unread_count: number;
};

export function enrichConversationUnread<T extends Record<string, unknown>>(
  conversation: T & { messages?: unknown; coach_unread?: number | null },
  coachId: string
): EnrichedConversation<T> {
  const msgs = ((conversation.messages as unknown[]) ?? []) as ChatListMessage[];
  const sorted = [...msgs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const last = sorted[sorted.length - 1] ?? null;
  const unread =
    conversation.coach_unread ?? msgs.filter((m) => !m.is_read && m.sender_id !== coachId).length;
  return { ...conversation, last_message: last, unread_count: unread };
}
