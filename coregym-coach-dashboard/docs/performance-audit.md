# Performance Audit — Coach Dashboard (Stream B, Phase 1: investigation only)

Date: 2026-09-14 · Scope: find why the dashboard "feels slow", with evidence.
**No fixes were applied for this phase.** Each item lists where, why it
matters, severity, effort, and whether it is *measured evidence* or a *hunch*.

## TL;DR — what "feels slow" most likely is today

The live database currently holds tiny data volumes (a handful of test rows)
and every dashboard query path examined hits an index. Today's slowness is
therefore **not** database-driven. The dominant, reproducible factor is
**dev-mode compile latency**: in `next dev`, every route compiles on first hit
(observed 1–8 s per page in the dev log), and hot reloads after code changes
re-trigger compiles. In production the risks below are what will actually slow
the app down as data grows — they are real, but they are growth risks, not
today's problem.

---

## Findings (evidence-backed)

### F1 — Chat loads the entire message history, unbounded
- **Where**: `src/components/chat/ChatClient.tsx` (messages fetch:
  `.from("messages").select("*").eq("conversation_id", …).order("created_at")`
  with no `limit`), thread renders one DOM bubble per message.
- **Impact**: payload and DOM grow forever. A conversation with 5,000 messages
  loads all 5,000 rows and renders 5,000 bubbles on open — multi-second loads
  and janky scrolling.
- **Severity**: Medium-High (worst long-term offender; chat is the most-used
  surface and media attachments make rows heavier).
- **Effort**: Low — initial load `limit 50` + "Load older" keyset pagination
  (`created_at < oldest`).
- **Type**: measured (code + query shape).

### F2 — Realtime channel churn + duplicate message rendering in chat
- **Where**: `ChatClient.tsx` realtime effect previously listed `conversations`
  and `selectedId` in its dependency array → the websocket channel was torn
  down and recreated on every conversation state change (i.e. on every incoming
  message), and each sent message was appended twice (local append + realtime
  echo).
- **Impact**: dropped/late realtime events, wasted websocket setup, double
  bubbles.
- **Status**: **FIXED as part of Stream A** (spec §12 allowed overlap — media
  delivery rides this exact subscription). Channel is now created once per
  session (latest values read through refs) and appends are id-deduplicated.
- **Type**: measured (code, before/after verified in browser: SQL-inserted
  message appeared live exactly once).
- Logged here so it stays tracked; no further action.

### F3 — `personal_records` view scans every user's workout history
- **Where**: live DB view `personal_records`
  (`SELECT DISTINCT ON (user_id, exercise_name) … FROM workout_sets JOIN
  workout_sessions … ORDER BY user_id, exercise_name, weight_kg DESC`).
  The dashboard filters `.eq("user_id", …)` **outside** the view; Postgres
  cannot reliably push that predicate through `DISTINCT ON`.
- **Impact**: every PR display scans the whole `workout_sets` table for all
  users, then filters. Cost grows with the **entire mobile app's** data, not
  just the viewed client's.
- **Severity**: Medium (data-dependent; small today, degrades with platform
  growth). **Effort**: Low-Medium — replace the view read with a parameterized
  query/RPC (`WHERE ws.user_id = $1` inside), or redefine the view with the
  filter inlined per call site. `workout_sessions(user_id, session_date)` and
  `workout_sets(session_id)` indexes already support it.
- **Type**: measured (view definition introspected); no EXPLAIN run — the
  scan shape is evident from the definition, actual timings not captured.

### F4 — Revenue page performs two sequential external Stripe calls in the
### render path
- **Where**: `src/app/(dashboard)/dashboard/revenue/page.tsx` —
  `stripe.payouts.list({limit:10})` then
  `stripe.balanceTransactions.list({limit:100})`, awaited one after the other
  during server render (only when Stripe is connected).
- **Impact**: page TTFB includes two round trips to Stripe's API (~200–800 ms
  each). The balance-transactions call fetching 100 rows is also more data
  than the view uses.
- **Severity**: Medium (perceived latency on every Revenue visit).
- **Effort**: Low-Medium — run both in `Promise.all`, trim the limit, or
  render the Stripe section behind Suspense so the page shell streams first.
- **Type**: measured (code).

### F5 — Data-heavy routes have no loading/streaming boundary
- **Where**: `subscribers/[id]` (≈10 queries: subscription, goals, daily
  summaries, nutrition, sessions, sets, measurements, assigned workouts,
  progress, enrollments), `subscribers/[id]/programs/[enrollmentId]`,
  `/dashboard/chat`, `/dashboard/revenue` have no `loading.tsx`. Only
  `workouts` and the program progress route's own `loading.tsx` exist.
- **Impact**: browser gets nothing until the slowest query finishes; combined
  with F4 or a cold cache the page appears frozen.
- **Severity**: Low-Medium (perceived performance).
- **Effort**: Low — add `loading.tsx` skeletons (pattern already exists in
  `workouts/loading.tsx`).
- **Type**: measured (file tree + query counts).

### F6 — Subscribers list page is unbounded
- **Where**: `src/app/(dashboard)/dashboard/subscribers/page.tsx` —
  subscriptions select with joined plan + client, no limit or pagination.
- **Impact**: payload and render grow linearly with client count (a coach with
  500 clients loads 500 joined rows at once).
- **Severity**: Low-Medium (grows with business size).
- **Effort**: Medium — search + pagination. **Note**: uncommitted WIP in the
  working tree (`components/dashboard/ClientSearch.tsx`, `api/coach/clients/search`)
  appears to address part of this — do not duplicate; audit again once that
  work lands.
- **Type**: measured (code).

### F7 — Incoming overview redesign adds a chart library (observation, not
### audited)
- **Where**: uncommitted WIP — `package.json` adds `recharts ^2.15.4`, new
  `components/dashboard/overview/*` + `lib/overview.ts` with range-based
  aggregates over `daily_summary`, `messages`, `workout_sessions`.
- **Impact**: recharts adds roughly 90–100 kB gzipped to the dashboard bundle;
  the range aggregates hit `daily_summary`/`messages` whose indexes I have not
  audited (`daily_summary` index state **not verified** — needs a look once the
  code is committed).
- **Severity**: Info / To-revisit. **Effort**: n/a (someone else's stream).
- **Type**: observation of uncommitted code — explicitly **not** audited.

## Non-findings (checked, healthy — so nobody re-audits these)

- **Indexes are largely correct for current queries**: `messages(conversation_id,
  created_at DESC)` (chat loads), `workout_sessions(user_id, session_date)` +
  `(assignment_id)` (history + mobile-link matching), `subscriptions(coach_id,
  status)` (subscriber list + active-client checks), `conversations(coach_id)`,
  `workout_sets(session_id)` (set loads). The only gap is the view scan in F3.
- **No N+1 patterns** in committed pages: the subscriber profile, programs
  progress, and workout helpers batch their queries (`Promise.all`, one sets
  query per batch of sessions).
- **Chat media signed URLs** (new in Stream A) are per-message, participant-
  checked, 15-minute TTL, refetched on error — no standing public links.
- **`next/image` is deliberately unused** for chat media: signed expiring URLs
  defeat the optimizer's caching; avatars are initials, not images.

## Prioritized fix order (highest impact-per-effort first)

| # | Item | Severity | Effort | Measured? |
| --- | --- | --- | --- | --- |
| 1 | F1 chat history pagination | Med-High | Low | Yes (code) |
| 2 | F4 parallelize/stream Revenue Stripe calls | Med | Low-Med | Yes (code) |
| 3 | F5 `loading.tsx` for heavy routes | Low-Med | Low | Yes (file tree) |
| 4 | F3 user-scoped PR query replacing view scan | Med | Low-Med | View def introspected; no EXPLAIN |
| 5 | F6 subscribers list pagination/search | Low-Med→grows | Med | Yes (code); coordinate with WIP |
| 6 | F7 overview bundle + index check | Info | n/a | Not audited (WIP) |

## Explicit hunches (flagged as unmeasured)

- **"Feels slow" root cause today is dev-compile latency, not the database** —
  based on dev-log timings (1–8 s per first route hit) and near-empty tables;
  no production profiling was done (none possible — not deployed with real
  data yet).
- The chat thread DOM size (F1) will degrade scrolling before it degrades the
  fetch — untested with a large conversation; synthetic 5k-message load would
  confirm.
- `workout_sets` volume queries capped at `limit 5000` could silently truncate
  for hyper-active clients (>5,000 sets in an 8-week window) — hunch; current
  volumes make it theoretical.
