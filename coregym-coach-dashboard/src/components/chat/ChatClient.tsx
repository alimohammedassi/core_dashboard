"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, Message } from "@/lib/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageSquare, Paperclip, ImagePlus, X, Search } from "lucide-react";
import { toast } from "sonner";
import { MediaMessage, messagePreview } from "@/components/chat/MediaMessage";
import { VoiceRecorder } from "@/components/chat/VoiceRecorder";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n/client";
import { AvatarImage } from "@/components/ui/avatar";

type ConvWithClient = Conversation & {
  client?: { full_name: string | null; avatar_url: string | null };
  last_message?: Message | null;
  unread_count?: number;
};

// Chat history pagination: load the newest page, then keyset-paginate older
// messages on demand so opening a conversation never loads unbounded history.
const PAGE_SIZE = 50;

type PendingAttachment = { file: File; type: "image" | "file" };

export function ChatClient({
  coachId,
  initialConversations,
  initialSelectedId = null,
}: {
  coachId: string;
  initialConversations: ConvWithClient[];
  /** Conversation to open on mount (client deep-link from profile pages). */
  initialSelectedId?: string | null;
}) {
  const { t, fmt } = useI18n();
  const supabase = React.useMemo(() => createClient(), []);
  const [conversations, setConversations] = React.useState<ConvWithClient[]>(initialConversations);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialSelectedId ?? conversations[0]?.id ?? null
  );
  const [rosterQuery, setRosterQuery] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  // Conversation whose newest page has arrived. `threadLoading` is derived
  // from it so the effect never sets state synchronously.
  const [loadedThreadId, setLoadedThreadId] = React.useState<string | null>(null);
  const [composer, setComposer] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [pending, setPending] = React.useState<PendingAttachment | null>(null);
  // P4: prefetched signed URLs for the open thread's media messages —
  // one batch call per page of messages instead of one POST per message.
  const [attachmentUrls, setAttachmentUrls] = React.useState<Record<string, string>>({});
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const threadWrapRef = React.useRef<HTMLDivElement>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;

  // Latest conversation list / selection for the realtime handler. Keeping
  // these in refs means the websocket channel is created ONCE per session —
  // re-subscribing on every state change used to drop events mid-chat.
  const conversationsRef = React.useRef(initialConversations);
  const selectedIdRef = React.useRef<string | null>(conversations[0]?.id ?? null);
  React.useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  React.useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  function appendMessage(msg: Message) {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }

  function bumpConversation(msg: Message) {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === msg.conversation_id);
      if (idx === -1) return prev;
      const copy = [...prev];
      const [conv] = copy.splice(idx, 1);
      copy.unshift({ ...conv, last_message: msg, last_message_at: msg.created_at } as ConvWithClient);
      return copy;
    });
  }

  // Load the newest PAGE_SIZE messages when selection changes; older history
  // is fetched on demand via loadOlder().
  React.useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);
      if (!cancelled) {
        setLoadedThreadId(selectedId);
        if (error) {
          toast.error(t("chat.thread.errorLoad", { message: error.message }));
        } else {
          const rows = (data as Message[]) ?? [];
          setHasMore(rows.length > PAGE_SIZE);
          setMessages(rows.slice(0, PAGE_SIZE).reverse());
          // Opening the conversation marks it read: reset the coach's unread
          // counter and flip the client-sent messages to read. RLS lets
          // conversation participants do both with their own session. The UI
          // is updated immediately so the badge disappears instantly, and the
          // state persists in the DB (refresh-safe).
          const unreadInPage = rows.some((m) => !m.is_read && m.sender_id !== coachId);
          const conv = conversationsRef.current.find((c) => c.id === selectedId);
          if (unreadInPage || (conv?.unread_count ?? 0) > 0) {
            const prevUnread = conv?.unread_count ?? 0;
            setConversations((prev) =>
              prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c))
            );
            setMessages((prev) =>
              prev.map((m) => (m.sender_id !== coachId ? { ...m, is_read: true } : m))
            );
            // CH1: persist the read state — awaited, retried once, rolled
            // back on failure so the badge reflects reality instead of
            // getting stuck cleared (or stuck set) after a failed write.
            const persistRead = () =>
              Promise.all([
                supabase
                  .from("messages")
                  .update({ is_read: true })
                  .eq("conversation_id", selectedId)
                  .neq("sender_id", coachId)
                  .eq("is_read", false),
                supabase.from("conversations").update({ coach_unread: 0 }).eq("id", selectedId),
              ]);
            try {
              const [msgRes, convRes] = await persistRead();
              if (msgRes.error || convRes.error) throw msgRes.error ?? convRes.error;
            } catch {
              try {
                const [msgRes2, convRes2] = await persistRead();
                if (msgRes2.error || convRes2.error) throw msgRes2.error ?? convRes2.error;
              } catch {
                // Roll the badge back so a refresh/retry can clear it.
                setConversations((prev) =>
                  prev.map((c) => (c.id === selectedId ? { ...c, unread_count: prevUnread } : c))
                );
                toast.error(t("chat.thread.errorMarkRead"));
              }
            }
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, supabase, coachId, t]);

  // P4: prefetch signed URLs for the visible page's media messages in ONE
  // batch call. MediaMessage still single-fetches as fallback (new realtime
  // arrivals, expired URLs), so this is purely an optimization.
  React.useEffect(() => {
    const ids = messages
      .filter(
        (m) =>
          (m.type === "image" || m.type === "voice" || m.type === "file") &&
          m.file_url &&
          attachmentUrls[m.id] === undefined
      )
      .map((m) => m.id);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageIds: ids }),
        });
        const b = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !b.urls) return;
        setAttachmentUrls((prev) => ({ ...prev, ...(b.urls as Record<string, string>) }));
      } catch {
        // Fallback path in MediaMessage covers failures — stay silent.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function loadOlder() {    if (!selectedId || !hasMore || loadingOlder) return;
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const viewport = threadWrapRef.current?.querySelector("[data-slot='scroll-area-viewport']");
      const prevHeight = viewport?.scrollHeight ?? 0;
      const prevTop = viewport?.scrollTop ?? 0;
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);
      if (error) {
        toast.error(t("chat.thread.errorLoadOlder", { message: error.message }));
        return;
      }
      const rows = (data as Message[]) ?? [];
      setHasMore(rows.length > PAGE_SIZE);
      setMessages((prev) => [...rows.slice(0, PAGE_SIZE).reverse(), ...prev]);
      // keep the viewport anchored on the message the user was reading
      requestAnimationFrame(() => {
        if (viewport) viewport.scrollTop = viewport.scrollHeight - prevHeight + prevTop;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  // Realtime subscription on messages for coach's conversations — single
  // channel for the whole session (see refs above).
  React.useEffect(() => {
    const channel = supabase
      .channel(`coach:${coachId}:messages`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          const belongs = conversationsRef.current.some((c) => c.id === msg.conversation_id);
          if (!belongs) return;
          if (msg.conversation_id === selectedIdRef.current) {
            appendMessage(msg);
            // The coach is actively viewing this conversation — mark the new
            // client message read immediately so the unread badge never
            // appears for the open thread.
            if (msg.sender_id !== coachId) {
              void supabase.from("messages").update({ is_read: true }).eq("id", msg.id);
            }
          }
          bumpConversation(msg);
        }
      )
      // CH2: read-state sync — the mobile app flips is_read / coach_unread
      // via UPDATEs, which the INSERT-only subscription never saw (stale
      // green badges). Merge both into local state live.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.conversation_id !== selectedIdRef.current) return;
          if (msg.sender_id === coachId) return;
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_read: msg.is_read } : m)));
          // If every client message in the open thread is now read, the
          // badge for this conversation can clear without a refresh.
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== msg.conversation_id) return c;
              return { ...c, unread_count: msg.is_read ? 0 : c.unread_count };
            })
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        (payload) => {
          const conv = payload.new as { id: string; coach_unread?: number | null };
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conv.id && typeof conv.coach_unread === "number"
                ? { ...c, unread_count: conv.coach_unread }
                : c
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, coachId]);

  // Auto-scroll only when a NEWEST message arrives — loading older history
  // must not yank the viewport to the bottom.
  const lastVisibleIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && last.id !== lastVisibleIdRef.current) {
      lastVisibleIdRef.current = last.id;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function refreshAfterSend(msg: Message) {
    appendMessage(msg);
    bumpConversation(msg);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    if (pending) {
      await sendAttachment();
      return;
    }
    if (!composer.trim()) return;
    const content = composer.trim();
    setSending(true);

    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: selectedId, sender_id: coachId, content })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
    } else if (data) {
      await refreshAfterSend(data as Message);
      setComposer("");
      // update conversation last_message_at
      await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", selectedId);
    }
    setSending(false);
  }

  async function sendAttachment() {
    if (!selectedId || !pending) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("conversationId", selectedId);
      form.set("type", pending.type);
      form.set("file", pending.file);
      const res = await fetch("/api/chat/upload", { method: "POST", body: form });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b?.error ?? t("chat.composer.attachmentFailed"));
      await refreshAfterSend(b as Message);
      setPending(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("chat.composer.attachmentFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleVoiceSend(file: File, durationSec: number) {
    if (!selectedId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("conversationId", selectedId);
      form.set("type", "voice");
      form.set("duration", String(durationSec));
      form.set("file", file);
      const res = await fetch("/api/chat/upload", { method: "POST", body: form });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b?.error ?? t("chat.composer.voiceFailed"));
      await refreshAfterSend(b as Message);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("chat.composer.voiceFailed"));
    } finally {
      setUploading(false);
    }
  }

  function pickPending(file: File | null, type: "image" | "file") {
    if (!file) return;
    setPending({ file, type });
  }

  // Roster search filters the already-loaded conversation list client-side.
  const q = rosterQuery.trim().toLowerCase();
  const visibleConversations = q
    ? conversations.filter((c) => {
        const name = (c.client?.full_name ?? "").toLowerCase();
        const preview = messagePreview(c.last_message as Message | undefined, t).toLowerCase();
        return name.includes(q) || preview.includes(q);
      })
    : conversations;

  return (
    <div className="grid h-[calc(100svh-9.5rem)] min-h-80 grid-cols-1 gap-4 md:h-[calc(100svh-8.5rem)] md:grid-cols-[360px_1fr]">
      {/* Conversation roster — Stitch left pane */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-headline-sm text-foreground">{t("chat.list.title")}</h2>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-label-sm tabular-nums text-muted-foreground">
              {conversations.length}
            </span>
          </div>
        </div>
        <div className="border-b p-3">
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              value={rosterQuery}
              onChange={(e) => setRosterQuery(e.target.value)}
              placeholder={t("chat.list.searchPlaceholder")}
              aria-label={t("chat.list.searchPlaceholder")}
              className="h-9 ps-8"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {visibleConversations.map((c) => {
              const name = c.client?.full_name ?? t("chat.clientFallback");
              const preview = messagePreview(c.last_message as Message | undefined, t);
              const isActive = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={`flex w-full gap-3 rounded-lg border-s-2 p-3 text-start transition-colors ${
                    isActive
                      ? "border-primary bg-secondary"
                      : "border-transparent hover:bg-secondary/60"
                  }`}
                >
                  <span className="relative shrink-0">
                    <Avatar className="size-9">
                      {c.client?.avatar_url ? <AvatarImage src={c.client.avatar_url} alt="" /> : null}
                      <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="absolute bottom-0 end-0 size-2 rounded-full bg-primary ring-2 ring-card" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-body-md font-semibold text-foreground">{name}</span>
                      {(c.unread_count ?? 0) > 0 && (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold tabular-nums text-primary-foreground">
                          {c.unread_count}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span className="truncate text-body-sm text-muted-foreground">{preview}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-faint">
                    {c.last_message_at ? fmt.date(c.last_message_at) : ""}
                  </span>
                </button>
              );
            })}
            {visibleConversations.length === 0 && (
              <p className="p-4 text-center text-body-sm text-muted-foreground">
                {q ? t("chat.list.searchEmpty") : t("chat.list.empty")}
              </p>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Thread — Stitch right pane */}
      <Card className="flex flex-col overflow-hidden">
        {!selectedConv ? (
          <CardContent className="flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="mx-auto mb-2 size-8 opacity-50" />
              <p className="text-sm">{t("chat.thread.select")}</p>
            </div>
          </CardContent>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b p-3">
              <Avatar className="size-9">
                {selectedConv.client?.avatar_url ? (
                  <AvatarImage src={selectedConv.client.avatar_url} alt="" />
                ) : null}
                <AvatarFallback className="text-xs">
                  {(selectedConv.client?.full_name ?? "C").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-body-md font-semibold text-foreground">
                  {selectedConv.client?.full_name ?? t("chat.clientFallback")}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-1.5 animate-pulse rounded-full bg-[#68dfa6]" />
                  {t("chat.thread.realtime")}
                </p>
              </div>
            </div>
            <div ref={threadWrapRef} className="min-h-0 flex-1">
              <ScrollArea className="h-full p-4">
                <div className="space-y-3">
                  {selectedId !== null && loadedThreadId !== selectedId && messages.length === 0 && (
                    <div className="flex justify-center py-10">
                      <Spinner size="lg" className="text-muted-foreground" />
                    </div>
                  )}
                  {hasMore && (
                    <div className="flex justify-center pb-2">
                      <Button type="button" variant="secondary" size="sm" disabled={loadingOlder} onClick={loadOlder}>
                        {loadingOlder ? t("chat.thread.loadingOlder") : t("chat.thread.loadOlder")}
                      </Button>
                    </div>
                  )}
                  {messages.map((m) => {
                    const isMe = m.sender_id === coachId;
                    const isMedia = m.type === "image" || m.type === "voice" || m.type === "file";
                    const clientName = selectedConv.client?.full_name ?? t("chat.clientFallback");
                    return (
                      <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                        <div className={`flex max-w-[85%] items-end gap-2 md:max-w-xl ${isMe ? "flex-row-reverse" : ""}`}>
                          {!isMe && (
                            <Avatar className="mb-1 size-7 shrink-0">
                              {selectedConv.client?.avatar_url ? (
                                <AvatarImage src={selectedConv.client.avatar_url} alt="" />
                              ) : null}
                              <AvatarFallback className="text-[10px]">
                                {clientName.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div
                            className={`px-3.5 py-2.5 text-body-md ${
                              isMe
                                ? "rounded-2xl rounded-ee-sm bg-primary font-medium text-primary-foreground shadow-[0_4px_16px_rgba(178,215,66,0.18)]"
                                : "rounded-2xl rounded-ss-sm bg-secondary text-foreground"
                            } ${isMedia ? "w-full min-w-56 max-w-sm" : ""}`}
                          >
                            {isMedia ? (
                              <MediaMessage message={m} prefetchedSrc={attachmentUrls[m.id]} />
                            ) : (
                              <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
                            )}
                          </div>
                        </div>
                        <span className={`flex items-center gap-1 px-1 pt-1 text-[11px] tabular-nums text-faint ${isMe ? "" : "ps-9"}`}>
                          {fmt.time(m.created_at)}
                          {!m.is_read && !isMe ? <span className="font-medium text-primary">· {t("chat.thread.unread")}</span> : ""}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
            </div>
            <form onSubmit={handleSend} className="space-y-2 border-t p-3">
              {pending && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {pending.type === "image" ? "📷 " : "📄 "}
                    {pending.file.name}
                    <span className="ms-1 text-xs text-muted-foreground">{t("chat.composer.pendingSize", { n: fmt.num(Math.round(pending.file.size / 1024)) })}</span>
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={t("chat.composer.removeAttachment")} onClick={() => setPending(null)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickPending(e.target.files?.[0] ?? null, "image")}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => pickPending(e.target.files?.[0] ?? null, "file")}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={t("chat.composer.attachImage")} disabled={uploading || !!pending} onClick={() => imageInputRef.current?.click()}>
                  <ImagePlus className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={t("chat.composer.attachFile")} disabled={uploading || !!pending} onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="size-4" />
                </Button>
                <VoiceRecorder onSend={handleVoiceSend} onDiscard={() => undefined} disabled={uploading || !!pending} />
                <Input
                  placeholder={t("chat.composer.placeholder")}
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  className="h-10 flex-1"
                  disabled={uploading || !!pending}
                />
                <Button
                  type="submit"
                  disabled={sending || uploading || (!composer.trim() && !pending)}
                  aria-label={pending ? t("chat.composer.sendAttachment") : t("chat.composer.send")}
                >
                  {t("chat.composer.send")}
                  {(sending || uploading) && pending ? <Spinner /> : <Send className="size-4" />}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
