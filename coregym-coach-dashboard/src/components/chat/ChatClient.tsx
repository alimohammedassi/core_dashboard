"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, Message } from "@/lib/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageSquare, Paperclip, ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MediaMessage, messagePreview } from "@/components/chat/MediaMessage";
import { VoiceRecorder } from "@/components/chat/VoiceRecorder";

type ConvWithClient = Conversation & {
  client?: { full_name: string | null; avatar_url: string | null };
  last_message?: Message | null;
  unread_count?: number;
};

// Chat history pagination: load the newest page, then keyset-paginate older
// messages on demand so opening a conversation never loads unbounded history.
const PAGE_SIZE = 50;

type PendingAttachment = { file: File; type: "image" | "file" };

export function ChatClient({ coachId, initialConversations }: { coachId: string; initialConversations: ConvWithClient[] }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [conversations, setConversations] = React.useState<ConvWithClient[]>(initialConversations);
  const [selectedId, setSelectedId] = React.useState<string | null>(conversations[0]?.id ?? null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [composer, setComposer] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [pending, setPending] = React.useState<PendingAttachment | null>(null);
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
        if (error) {
          toast.error("Failed to load messages: " + error.message);
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
            setConversations((prev) =>
              prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c))
            );
            setMessages((prev) =>
              prev.map((m) => (m.sender_id !== coachId ? { ...m, is_read: true } : m))
            );
            void supabase
              .from("messages")
              .update({ is_read: true })
              .eq("conversation_id", selectedId)
              .neq("sender_id", coachId)
              .eq("is_read", false);
            void supabase.from("conversations").update({ coach_unread: 0 }).eq("id", selectedId);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, supabase, coachId]);

  async function loadOlder() {
    if (!selectedId || !hasMore || loadingOlder) return;
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
        toast.error("Failed to load older messages: " + error.message);
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
      if (!res.ok) throw new Error(b?.error ?? "Attachment failed");
      await refreshAfterSend(b as Message);
      setPending(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Attachment failed");
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
      if (!res.ok) throw new Error(b?.error ?? "Voice note failed");
      await refreshAfterSend(b as Message);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Voice note failed");
    } finally {
      setUploading(false);
    }
  }

  function pickPending(file: File | null, type: "image" | "file") {
    if (!file) return;
    setPending({ file, type });
  }

  return (
    <div className="grid h-[calc(100svh-8rem)] grid-cols-1 gap-4 md:grid-cols-[340px_1fr]">
      {/* Conversation list */}
      <Card className="flex flex-col overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-sm">Conversations</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map((c) => {
              const name = c.client?.full_name ?? "Client";
              const preview = messagePreview(c.last_message as Message | undefined);
              const isActive = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left flex gap-3 rounded-lg p-3 hover:bg-muted transition-colors ${isActive ? "bg-muted" : ""}`}
                >
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{name}</span>
                      {(c.unread_count ?? 0) > 0 && <Badge className="h-5 px-1.5 text-xs">{c.unread_count}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{preview}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString() : ""}
                  </span>
                </button>
              );
            })}
            {conversations.length === 0 && (
              <p className="text-sm text-muted-foreground p-4 text-center">No conversations yet.</p>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Thread */}
      <Card className="flex flex-col overflow-hidden">
        {!selectedConv ? (
          <CardContent className="flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="mx-auto size-8 mb-2 opacity-50" />
              <p className="text-sm">Select a conversation</p>
            </div>
          </CardContent>
        ) : (
          <>
            <div className="p-3 border-b flex items-center gap-3">
              <Avatar className="size-8">
                <AvatarFallback>{(selectedConv.client?.full_name ?? "C").slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{selectedConv.client?.full_name ?? "Client"}</p>
                <p className="text-xs text-muted-foreground">Realtime</p>
              </div>
            </div>
            <div ref={threadWrapRef} className="flex-1 min-h-0">
              <ScrollArea className="h-full p-4">
                <div className="space-y-3">
                  {hasMore && (
                    <div className="flex justify-center pb-2">
                      <Button type="button" variant="outline" size="sm" disabled={loadingOlder} onClick={loadOlder}>
                        {loadingOlder ? "Loading older messages…" : "Load older messages"}
                      </Button>
                    </div>
                  )}
                  {messages.map((m) => {
                  const isMe = m.sender_id === coachId;
                  const isMedia = m.type === "image" || m.type === "voice" || m.type === "file";
                  return (
                    <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isMe ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}
                      >
                        {isMedia ? (
                          <MediaMessage message={m} />
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        )}
                        <span className={`text-xs mt-1 block ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {!m.is_read && !isMe ? " · unread" : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>
            </div>
            <form onSubmit={handleSend} className="p-3 border-t space-y-2">
              {pending && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <Loader2 className="hidden size-3.5 animate-spin" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {pending.type === "image" ? "📷 " : "📄 "}
                    {pending.file.name}
                    <span className="ml-1 text-xs text-muted-foreground">({Math.round(pending.file.size / 1024)} KB)</span>
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Remove attachment" onClick={() => setPending(null)}>
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
                <Button type="button" variant="ghost" size="icon" aria-label="Attach image" disabled={uploading || !!pending} onClick={() => imageInputRef.current?.click()}>
                  <ImagePlus className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Attach file" disabled={uploading || !!pending} onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="size-4" />
                </Button>
                <VoiceRecorder onSend={handleVoiceSend} onDiscard={() => undefined} disabled={uploading || !!pending} />
                <Input
                  placeholder="Type a message…"
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  className="flex-1"
                  disabled={uploading || !!pending}
                />
                <Button
                  type="submit"
                  disabled={sending || uploading || (!composer.trim() && !pending)}
                  size="icon"
                  aria-label={pending ? "Send attachment" : "Send"}
                >
                  {(sending || uploading) && pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
