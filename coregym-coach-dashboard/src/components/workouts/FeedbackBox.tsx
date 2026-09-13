"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Quick coach feedback after a performance review — inserts into the existing
// chat conversation so the client receives it in the mobile app.
export function FeedbackBox({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [content, setContent] = React.useState("");
  const [sending, setSending] = React.useState(false);

  async function handleSend() {
    const text = content.trim();
    if (!text) {
      toast.error("Message cannot be empty");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/workout-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, content: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Send failed");
      toast.success("Message sent");
      setContent("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Textarea
        rows={3}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Great progress on bench press. Let's increase the weight next session."
      />
      <Button type="button" onClick={handleSend} disabled={sending || !content.trim()}>
        <Send className="mr-1 size-3.5" />
        {sending ? "Sending…" : "Send message"}
      </Button>
    </div>
  );
}
