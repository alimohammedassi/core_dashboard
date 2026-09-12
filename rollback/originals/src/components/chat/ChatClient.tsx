"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, Message } from "@/lib/supabase/types";
import { mockConversations, mockMessages } from "@/lib/mock";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageSquare } from "lucide-react";
import { toast } from "sonner";

type ConvWithClient = Conversation & {
  client?: { full_name: string | null; avatar_url: string | null };
  last_message?: Message | null;
  unread_count?: number;
};

export function ChatClient({ coachId, initialConversations }: { coachId: string; initialConversations: ConvWithClient[] }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [conversations, setConversations] = React.useState<ConvWithClient[]>(
    initialConversations.length ? initialConversations : (mockConversations as unknown as ConvWithClient[])
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(conversations[0]?.id ?? null);
  const [messages, setMessages] = React.useState<Message[]>(
    selectedId ? (mockMessages[selectedId] ?? []) : []
  );
  const [composer, setComposer] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [isMock, setIsMock] = React.useState(initialConversations.length === 0);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;

  // Load messages when selection changes
  React.useEffect(() => {
    if (!selectedId) return;
    if (isMock) {
      setMessages(mockMessages[selectedId] ?? []);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        if (error) {
          toast.error("Failed to load messages: " + error.message);
        } else {
          setMessages((data as Message[]) ?? []);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, supabase, isMock]);

  // Realtime subscription on messages for coach's conversations
  React.useEffect(() => {
    if (isMock) return;
    const channel = supabase
      .channel(`coach:${coachId}:messages`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          // Only show if belongs to coach's conversations
          const belongs = conversations.some((c) => c.id === msg.conversation_id);
          if (!belongs) return;
          if (msg.conversation_id === selectedId) {
            setMessages((prev) => [...prev, msg]);
          }
          // bump conversation to top and update preview
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === msg.conversation_id);
            if (idx === -1) return prev;
            const copy = [...prev];
            const [conv] = copy.splice(idx, 1);
            copy.unshift({ ...conv, last_message: msg, last_message_at: msg.created_at } as ConvWithClient);
            return copy;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, coachId, selectedId, conversations, isMock]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !composer.trim()) return;
    const content = composer.trim();
    setSending(true);

    if (isMock) {
      const newMsg: Message = {
        id: `mock_${Date.now()}`,
        conversation_id: selectedId,
        sender_id: coachId,
        content,
        read: false,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, newMsg]);
      setComposer("");
      setSending(false);
      // update conversation preview
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === selectedId);
        if (idx === -1) return prev;
        const copy = [...prev];
        const [conv] = copy.splice(idx, 1);
        copy.unshift({ ...conv, last_message: newMsg, last_message_at: newMsg.created_at } as ConvWithClient);
        return copy;
      });
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: selectedId, sender_id: coachId, content })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
    } else if (data) {
      setMessages((prev) => [...prev, data as Message]);
      setComposer("");
      // update conversation last_message_at
      await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", selectedId);
    }
    setSending(false);
  }

  return (
    <div className="grid h-[calc(100svh-8rem)] grid-cols-1 gap-4 md:grid-cols-[340px_1fr]">
      {/* Conversation list */}
      <Card className="flex flex-col overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-sm">Conversations</h2>
          {isMock && <Badge variant="outline" className="text-xs">Mock</Badge>}
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map((c) => {
              const name = c.client?.full_name ?? "Client";
              const preview = (c.last_message as Message | undefined)?.content ?? "No messages yet";
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
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {messages.map((m) => {
                  const isMe = m.sender_id === coachId;
                  return (
                    <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isMe ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        <span className={`text-xs mt-1 block ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {!m.read && !isMe ? " · unread" : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>
            <form onSubmit={handleSend} className="p-3 border-t flex gap-2">
              <Input
                placeholder="Type a message…"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={sending || !composer.trim()} size="icon" aria-label="Send">
                <Send className="size-4" />
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
