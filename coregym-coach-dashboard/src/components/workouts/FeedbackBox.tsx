"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Quick coach feedback after a performance review — inserts into the existing
// chat conversation so the client receives it in the mobile app.
export function FeedbackBox({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [content, setContent] = React.useState("");
  const [sending, setSending] = React.useState(false);

  async function handleSend() {
    const text = content.trim();
    if (!text) {
      toast.error(t("workouts.feedback.empty"));
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
      if (!res.ok) throw new Error(body?.error ?? t("workouts.error.sendFailed"));
      toast.success(t("workouts.feedback.sent"));
      setContent("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("workouts.error.sendFailed"));
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
        placeholder={t("workouts.feedback.placeholder")}
      />
      <Button type="button" onClick={handleSend} disabled={sending || !content.trim()}>
        <Send className="me-1 size-3.5" />
        {sending ? t("workouts.feedback.sending") : t("workouts.feedback.send")}
      </Button>
    </div>
  );
}
