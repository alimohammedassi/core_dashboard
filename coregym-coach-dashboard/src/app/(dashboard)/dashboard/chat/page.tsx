import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { enrichConversationUnread } from "@/lib/chat-unread";
import { getI18n } from "@/lib/i18n/server";
import { ChatClient } from "@/components/chat/ChatClient";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// F-01: profile pages deep-link here with ?client=<profile id>. The param
// used to be matched against EXISTING conversations only, so starting a chat
// with a client who never messaged was silently ignored (the thread never
// opened). The bootstrap below find-or-creates the conversation server-side
// BEFORE the roster is loaded, so ChatClient always receives the selected
// conversation in its initial list.
//
// Security contract:
// - The param is only trusted after (a) a UUID format check and (b) an
//   ownership check — the client must have a subscription row owned by this
//   coach (subscriptions.coach_id references coaches.id, the same live
//   relation every subscriber page verifies through resolveCoachId). A
//   foreign/unknown id degrades to the plain conversation list; nothing is
//   created for it.
// - conversations.coach_id is the AUTH USER id (profiles.id), NOT coaches.id
//   — the convention the roster query and the Flutter app both use. The
//   authenticated insert relies on RLS `conversations_participant_insert`
//   (coach_id = auth.uid()), so no service role is involved.
// - Duplicate guard: find-first, then insert, then re-select on insert error.
//   The shared schema declares UNIQUE (coach_id, client_id), so a double
//   submit (or the coach clicking the button twice, or the Flutter app
//   creating the same conversation) loses the race harmlessly: the losing
//   insert fails and the re-select returns the winner's row. If the live DB
//   is missing that index, the re-select still picks the newest duplicate;
//   applying `CREATE UNIQUE INDEX IF NOT EXISTS conversations_coach_client_uniq
//   ON public.conversations (coach_id, client_id);` closes the residual race
//   completely (tracked in the remediation log — SQL is another agent's lane).
async function resolveClientConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coachUserId: string,
  rawClientId: string | undefined
): Promise<string | null> {
  const clientId = (rawClientId ?? "").trim();
  if (!UUID_RE.test(clientId)) return null;

  // 1) Ownership: the client must be this coach's subscriber (any status —
  // the profile page offers "Send message" for the whole roster).
  const coachId = await resolveCoachId(supabase, coachUserId);
  try {
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("coach_id", coachId)
      .eq("client_id", clientId)
      .limit(1);
    if (subErr || !sub || sub.length === 0) return null;
  } catch {
    return null; // ownership check unavailable — never bootstrap on a maybe
  }

  // 2) Find-first (unique coach+client pair), insert when missing.
  const selectId = async (): Promise<string | null> => {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("coach_id", coachUserId)
      .eq("client_id", clientId)
      .limit(1);
    const row = (data ?? [])[0] as { id: string } | undefined;
    return row?.id ?? null;
  };

  const existing = await selectId();
  if (existing) return existing;

  const { error: insertErr } = await supabase
    .from("conversations")
    .insert({ coach_id: coachUserId, client_id: clientId });
  if (insertErr) {
    // Most likely the UNIQUE (coach_id, client_id) race — the conversation
    // was created by a concurrent request (or the mobile app). Re-select.
    return selectId();
  }
  return selectId();
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ client?: string }>;
}) {
  const { t } = await getI18n();
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return null;

  // conversations.coach_id is the auth user id
  const coachId = user.id;

  // Resolve the deep-linked client FIRST so a bootstrap-created conversation
  // is part of the roster payload below.
  const bootstrapId = await resolveClientConversation(
    supabase,
    coachId,
    (await searchParams)?.client
  );

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

  // The bootstrap result wins; the legacy list match stays as a fallback for
  // the rare case the bootstrap was skipped (e.g. ownership check unavailable).
  const clientId = (await searchParams)?.client ?? null;
  const initialSelectedId =
    bootstrapId ??
    (clientId
      ? ((initial as unknown as Array<{ id?: string; client?: { id?: string } }>).find(
          (c) => c.client?.id === clientId
        )?.id ?? null)
      : null);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{t("chat.page.title")}</h1>
      <ChatClient
        coachId={coachId}
        initialConversations={initial as never}
        initialSelectedId={initialSelectedId}
      />
    </div>
  );
}
