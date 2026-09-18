# Performance Investigation — Pre-Deployment (read-only, no fixes applied)

Date: 2026-09-15 · Local dev (`next dev`, localhost:3000) · Measured, not estimated.
No application code, configuration, or database objects were modified for this investigation.

## A. Environment

| Component | Version |
| --- | --- |
| Framework | Next.js 16.3.4 (App Router, Turbopack dev) |
| React | 19.2.8 |
| Node | v24.13.1 |
| Supabase client | supabase-js ^2.116.0, @supabase/ssr ^0.12.7 |
| Charts | recharts ^3.10.1 (restored) |
| Dev environment | F: drive — Next warns "Slow filesystem detected" (benchmark 321 ms); affects dev-compile timing only |
| Data volume | Current live volume (post-load-test cleanup): 8 subscriptions, 10 conversations, 55 messages, 26 sessions, 113 assignments |

Caching: none — no React Query/SWR; server components fetch per request; no route cache reuse observed between navigations.

## B. Page timings

**Browser-experienced (warm, second visit, loadtest-coach session at capture time):**

| Page | TTFB | DOMContentLoaded | Load | Transfer | Client fetches |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/login` | 107 ms | 509 ms | 681 ms | 6 KB | 0 |
| `/dashboard` (1st hit after restart) | 8,196 ms | 8,625 ms | 8,711 ms | 12 KB | 0 |
| `/dashboard` (warm) | 2,949 ms | 3,389 ms | 3,551 ms | 12 KB | 0 |
| `/dashboard/subscribers` (1st hit) | 5,933 ms | 7,557 ms | 7,564 ms | 14 KB | 0 |
| `/dashboard/subscribers` (warm) | 928 ms | 1,374 ms | 1,527 ms | 14 KB | 0 |
| `/dashboard/chat` (1st hit) | 2,191 ms | 2,611 ms | 2,740 ms | 15 KB | 1 |
| `/dashboard/chat` (warm) | 743 ms | 1,212 ms | 1,365 ms | 15 KB | 1 |

**Server-side (node fetch with auth cookie, warm, median of 3):**

| Page | TTFB | Full response | Body | Note |
| --- | ---: | ---: | ---: | --- |
| `/login` | 78 ms | 78 ms | 22.3 KB | static shell, no queries |
| `/dashboard` | 1,156 ms | 1,156 ms | 63.6 KB | TTFB == full: nothing flushed early |
| `/dashboard/subscribers` | 689 ms | 689 ms | 81.2 KB | TTFB == full |
| `/dashboard/chat` | 473 ms | 473 ms | 67.5 KB | TTFB == full |

Cold first-hit compiles (dev only): 5–8 s per route observed (e.g. /dashboard 8.2 s TTFB on first browser hit after server restart).

## C. Slow requests traced to source

| # | Request / query | Median | Source | Table | When |
| --- | --- | ---: | --- | --- | --- |
| C1 | GoTrue `/auth/v1/user` (`getUser`) | 148 ms | layout + every page (`createClient().auth.getUser()`) | Supabase Auth | blocks first render, **run twice per navigation** (layout + page) |
| C2 | `profiles` role check | 290 ms (max 785) | `(dashboard)/layout.tsx` + pages | `profiles` | blocks render |
| C3 | `resolveCoachId()` — another `profiles` query | ~290 ms | `src/lib/coach.ts`, called by every page | `profiles` → `coaches` | blocks render, **duplicates C2's table** |
| C4 | Subscribers list join (`subscriptions` ⊕ plan ⊕ client) | 299 ms | `subscribers/page.tsx` | 3 tables | blocks render |
| C5 | Overview query batch (8 queries: subscriptions, payment_intents ×2, conversations, messages, workout_sessions, user_goals, daily_summary) | 114–152 ms each, **run in parallel via Promise.all** | `lib/overview.ts` `getOverviewData()` | 7 tables | parallel — costs the slowest (~150 ms), not the sum |
| C6 | Chat conversations + embedded messages + client join | 133 ms | `chat/page.tsx` | `conversations` ⊕ `messages` ⊕ `profiles` | blocks render |
| C7 | Client-side messages fetch (selected conversation) | 358 ms | `ChatClient.tsx` effect | `messages` | client-side, after render |

Measured per-query round-trip floor on this machine/network: **~110–150 ms** (Supabase is remote). This RTT dominates every query at current data volume.

## D. Root causes by layer

**Database:** no measurable DB-time problem at current volume. All dashboard queries are indexed, column-projected, filtered, and bounded. `personal_records` pushdown verified earlier via EXPLAIN. (DB execution time per query not separately measurable from here — API round-trip time includes network; stated explicitly.)

**Supabase/network:** the ~110–150 ms per-call round trip from this machine is the single biggest component of server TTFB. It multiplies by the number of *sequential* calls, not parallel ones.

**Next.js/server:** the real server-side problem is the **serial auth → role → coach-resolution chain** (C1→C2→C3) that every authenticated page executes before fetching data: 2× `getUser` + 2× `profiles` queries ≈ 600–900 ms of blocking round trips. `/dashboard` measured 1,156 ms ≈ 4–5 sequential round trips + one parallel batch (~150 ms) + render — consistent with this decomposition.

**React/client:** hydration and client JS are minor (load − TTFB ≈ 400–800 ms on the heaviest page). No client-side fetch waterfalls: overview/subscribers/chat fetch server-side; chat makes exactly 1 client-side call (by design, for realtime).

**Bundle/loading:** no oversized client bundles detected (page transfer 6–15 KB HTML; JS chunks cached). Dev-mode compile latency (5–8 s cold, worsened by the slow F: filesystem) is a **dev-only artifact** — production builds have no per-route compile.

## E. Recommended fixes (priority order — NOT applied)

1. **De-duplicate the auth chain** — run `getUser`/role/`resolveCoachId` once per request (React `cache()` or pass through layout→page), saving 2 sequential round trips on every authenticated page. *Expected: −300 to −600 ms TTFB on every page.* Risk: low (same data, fewer calls).
2. **Add a `loading.tsx` to `/dashboard`** (the only data-heavy route without one) so the overview streams its shell instead of a blank page during the 1.2 s+ server render. *Expected: perceived load improves immediately.* Risk: none.
3. **Bound the chat conversations message-embed** — `chat/page.tsx` embeds *all* messages of *every* conversation in one query, unbounded as history grows; the client then re-fetches the selected thread anyway. Embed only the latest message (or drop the embed). *Expected: prevents future payload growth; removes duplicate data transfer.* Risk: low (preview uses the same fields the client already computes).
4. *(Production-only effect)* Deploy in the same region as the Supabase project — the ~110–150 ms per-call RTT shrinks ~10× from Vercel, cutting every page's TTFB proportionally. No code change.
5. *(Optional, later)* Evaluate caching/revalidation for overview aggregates if range-switching feels heavy in production. Not measurable locally.

## F. Risks to watch (when fixes are later applied)

- **Authentication**: consolidating the auth chain must keep the middleware session refresh and the non-coach gate behavior identical.
- **RLS/security**: any consolidated client must preserve coach scoping (`resolveCoachId` semantics — never the auth uid as coach id).
- **Data correctness**: bounding the chat message-embed must not break the conversation-preview rendering (it uses the same fields `messagePreview` computes).
- **Realtime**: chat pagination and the single-channel realtime subscription must remain untouched.
- **Functionality**: none of these changes alter query results; they alter when/how many round trips happen.

## G. Deployment readiness

The investigation is **complete**: all four requested routes measured at browser and server level, every significant request traced to source, and the bottleneck layer identified (sequential auth round trips + per-call network RTT — **not** the database and **not** Supabase compute).

Known blockers **before Vercel deployment** (unchanged from the readiness pass, all owner-side):
1. Overview WIP commit (the tree's chart-dependency state was fixed in `f44e35f`; the remaining overview edits are uncommitted)
2. `vercel login` + project/branch mapping verification
3. Owner decisions/approvals: `rls_role_updates.sql`, `personal_records_index.sql`, QA-remnant cleanup
4. Mobile app release with the new publishable key (legacy API keys are now deactivated — the old mobile builds get 401s until updated)

Performance itself is **not** a deployment blocker: worst warm page is ~1.2 s server time locally, and Vercel-to-Supabase same-region deployment should reduce that substantially.
