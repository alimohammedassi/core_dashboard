import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrichConversationUnread } from "../src/lib/chat-unread.ts";

const COACH = "coach-uid-1";
const CLIENT = "client-uid-9";

const msg = (over: Record<string, unknown> = {}) => ({
  created_at: "2026-09-20T10:00:00Z",
  is_read: false as boolean | null,
  sender_id: CLIENT,
  ...over,
});

describe("enrichConversationUnread", () => {
  it("prefers the precomputed coach_unread counter", () => {
    const out = enrichConversationUnread(
      { id: "c1", coach_unread: 3, messages: [msg({ is_read: true })] },
      COACH
    );
    assert.equal(out.unread_count, 3);
  });

  it("falls back to counting unread client messages, ignoring own", () => {
    const out = enrichConversationUnread(
      {
        id: "c1",
        coach_unread: null,
        messages: [
          msg({ is_read: false, sender_id: CLIENT }),
          msg({ is_read: false, sender_id: COACH }),
          msg({ is_read: true, sender_id: CLIENT }),
        ],
      },
      COACH
    );
    assert.equal(out.unread_count, 1);
  });

  it("treats null is_read as unread", () => {
    const out = enrichConversationUnread(
      { id: "c1", messages: [msg({ is_read: null })] },
      COACH
    );
    assert.equal(out.unread_count, 1);
  });

  it("picks the latest message as last_message", () => {
    const out = enrichConversationUnread(
      {
        id: "c1",
        messages: [
          msg({ created_at: "2026-09-20T12:00:00Z" }),
          msg({ created_at: "2026-09-20T09:00:00Z" }),
        ],
      },
      COACH
    );
    assert.equal((out.last_message as { created_at: string }).created_at, "2026-09-20T12:00:00Z");
  });

  it("handles empty history as null message and zero unread", () => {
    const out = enrichConversationUnread({ id: "c1", messages: [] }, COACH);
    assert.equal(out.last_message, null);
    assert.equal(out.unread_count, 0);
  });
});
