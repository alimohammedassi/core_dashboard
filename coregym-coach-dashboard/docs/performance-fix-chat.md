# Performance Fix Report — Chat Conversation-List Payload

Date: 2026-09-15 · Scope: exactly the chat message-embed issue. No other files or behavior touched. Nothing committed or pushed.

## Before

From `docs/performance-investigation-deploy.md` and fresh same-day measurements (QA-coach session, live data: 1 conversation, 9 messages):

| Metric | Before |
| --- | ---: |
| Chat server TTFB (node, warm, median of 3) | 702 ms (min 574) |
| Browser load (warm, from original investigation) | 1,365 ms |
| Page response size | 95,727 B |
| Conversation-list query payload | 2,259 B — **all 9 messages embedded** |
| Supabase request count (server render) | 1 conversation query (+1 cached auth/profile chain) |

Structural problem confirmed: the query embedded every message of every conversation (`messages(id, content, created_at, sender_id, is_read)` with no bound). At the load-test volume a 123-message conversation alone contributed ~40 KB — the payload grows linearly with total message history, and the selected thread is then fetched again client-side (duplicated transfer).

## After

| Metric | After | Δ |
| --- | ---: | --- |
| Chat server TTFB (node, warm, median of 3) | 596 ms (min 596, max 708) | −106 ms median |
| Browser load (warm) | ~1.0 s | unchanged within dev noise |
| Page response size | 94,019 B | −1.7 KB at current (tiny) data volume |
| **Conversation-list query payload** | **609 B — exactly 1 embedded message per conversation** | **−73% now; flat as history grows** |
| Supabase request count | unchanged | — |

**Full message history removed from the conversation-list response: YES.** Verified directly through supabase-js (the app's own client): the query returns exactly one embedded message per conversation — the latest — and the payload no longer scales with total message count (at the earlier 123-message test volume this query would have been ~40 KB; it now stays at the 609 B class regardless).

## Code changes

| File | Change |
| --- | --- |
| `src/app/(dashboard)/dashboard/chat/page.tsx` | Conversations query only: added `.order("created_at", { ascending: false, referencedTable: "messages" })` + `.limit(1, { referencedTable: "messages" })` so the embed carries each conversation's **latest message only** (native PostgREST embedded-resource bound — no N+1, no RPC, no schema change). Added `type` to the embedded fields because the preview renderer (`messagePreview`) needs it to render media-message previews correctly (pre-existing gap: media previews fell through to raw content). The enrichment code (sort/last/unread) is unchanged and works unchanged on the 1-row embed — the live `coach_unread` precomputed counter remains the unread source. |

`ChatClient.tsx` was **not modified**: thread loading, "Load older" pagination, realtime subscription, sending, and previews all consume the same fields as before.

## Regression testing (executed, in-browser)

1. Open `/dashboard/chat` — renders ✓
2. Conversation list appears ✓
3. Preview shows the latest message ("Pagination regression check" / then the newer test messages) ✓ — now with correct media-type rendering capability via the `type` field
4. Select a conversation — thread opens ✓
5. Messages load with ordering ✓ (verified including post-reload)
6. Pagination — untouched (ChatClient unchanged; load-tested previously)
7. Send a message — appears exactly once, no duplicates ✓, composer clears, preview updates ✓
8. Realtime receive — **verified live**: a message inserted from the client side appeared in the open thread exactly once and the conversation preview updated ✓ (an earlier single miss was traced to a stale websocket during the dev-server recompile mid-test, not to the change — confirmed by a Realtime `postgres_changes` join probe: the channel authorizes and subscribes successfully with the new keys, and a clean re-test delivered)
9. Switch conversations ✓ (reselect)
10. Return to original — thread intact ✓
11. Logout/login — performed during this session's fresh UI login ✓

## Security verification

- No API keys changed; no secrets added (nothing committed; no values printed).
- RLS unchanged — the query runs in the same user context as before (RLS-scoped).
- Authentication unchanged — `getCurrentUser` chain untouched by this fix.
- Coach authorization unchanged — same `coach_id = auth uid` conversation filter.
- Realtime security unchanged — same channel, same RLS-scoped postgres_changes subscription; probe confirmed authorization works with the current keys.
- No cross-user data exposure — the embedded message is scoped by the same conversation filter as before; less data is exposed than before (one message instead of all).

## Result

The measured bottleneck (unbounded message embedding in the conversation-list query) is **removed**: the conversation-list payload is bounded to one message per conversation regardless of history size (609 B vs 2,259 B at current small volume; the gap widens linearly as history grows). Chat server TTFB improved 702 → 596 ms median at current volume; the larger wins arrive as message history grows, where the old payload scaled without bound. No percentage claims beyond these measured deltas.
