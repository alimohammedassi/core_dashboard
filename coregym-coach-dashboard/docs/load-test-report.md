# Load Test Report — 50 Seeded Clients (Phase 1)

Date: 2026-09-14 · Environment: **local dev server only** (`localhost:3000`, Next.js dev/Turbopack) against the live Supabase project. No load-test traffic touched any public URL.
Status: **investigation only** — no fixes applied. Phase 2 (production deploy) has **not** been started.

## What was seeded

Full inventory: [`loadtest-manifest.json`](../loadtest-manifest.json) (every auth-user/profile/subscription/conversation/message/session/enrollment/assignment id and every storage object path).

Tagging convention (unmistakable, reversible): emails `loadtest+NNN@coregym.test`, names `[LOADTEST] NNN`, templates/program prefixed `[LOADTEST]`. Nothing outside the tagged set was created, and no pre-existing coach/client rows were modified.

| Seeded | Count | Notes |
| --- | --- | --- |
| Test coach | 1 | `loadtest+coach@coregym.test` — created because the earlier QA coach fixture's `coaches` row had been **deleted externally** before seeding (observed; see "Incidents") |
| Workout templates | 3 | `[LOADTEST] Push/Pull/Leg Day` via the atomic RPC |
| Coach program | 1 | `[LOADTEST] PPL Weekly` (Mon/Wed/Fri) |
| Clients | 50 | auth users + profiles + **active subscriptions** to the test coach |
| Conversations / messages | 10 / 174 | incl. one **123-message** conversation (pagination pressure) and image/voice/file media trios in 5 conversations (15 storage objects) |
| Workout history | 10 clients | 50 sessions, ~450 set logs across 4 weeks |
| Program enrollments | 10 clients | 240 generated `workout_assignments` (8 weeks × 3 days each) |
| Empty clients | 20 | exercise empty states at volume |

## Scenario results (sequential, warm route, median of 3)

| Scenario | Median | Notes |
| --- | --- | --- |
| S1 Subscribers list (50 clients) | **1,584–1,932 ms** | one 5,352 ms outlier (dev recompile during run); all 200s |
| S2 Profile — workout-history client | 2,084–2,115 ms | ~13 Supabase round trips per render |
| S3 Program progress grid (8×3) | 1,223–2,310 ms | grid + adherence + regenerate render correctly |
| S4 Performance review (assigned, no session) | 1,232–1,600 ms | renders the correct "session not linked yet" state |
| S5 Chat page | 541–632 ms | |
| S6 Revenue | 896–1,037 ms | |
| S7 Overview | 894–1,064 ms | |

**Concurrency (3 waves × 7 routes in parallel):** zero errors across all waves; wall time 4.2–4.5 s per wave, dominated by the slowest route (the subscriber profile). No 5xx, no hangs, no incorrectly rendered content observed in DOM spot-checks.

## Previously-approved fixes under load

| Fix | Held? | Evidence |
| --- | --- | --- |
| **#1 Chat pagination** | ✅ **Held** | The 123-message conversation loads exactly **50 rows / 16.7 KB** (the unbounded query would have fetched 123 rows / 40.0 KB — measured both). Browser: 52 thread nodes on open, each "Load older" adds a page (102 after one click), keyset continues correctly. Load time stays flat as history grows — the problem the fix exists for did not reproduce. |
| **#3 Loading skeletons** | ✅ **Held** | All four routes streamed skeletons (streaming boundary verified in the HTML); under load the slowest routes (S1–S4) show the skeleton immediately instead of a blank page. |
| **#2 Revenue parallelize** | ⚠️ Not exercised | The Stripe path is unreachable for every coach until the known `stripe_account_id` schema mismatch (profiles vs coaches) is resolved — the page correctly took the local-estimate path (896–1,037 ms). The parallelization is verified by benchmark (see perf audit) and will engage the moment a real account is connected. |

## New findings at 50-client volume (report only — no fixes)

| # | Finding | Where | Impact | Severity | Effort |
| --- | --- | --- | --- | --- | --- |
| N1 | Subscribers list at 50 clients renders in 1.6–1.9 s (one 5.4 s outlier under recompile). Audit item F6 (unbounded list, joined rows) is now **confirmed with data**: cost grows linearly with client count. | `subscribers/page.tsx` | Feels slow at 50; materially worse at 200+ | Medium | Medium — pagination/search (partially overlaps the in-flight ClientSearch WIP) |
| N2 | Page latency scales linearly with Supabase round-trip count: profile (~13 calls) = ~2.1 s, chat (2 calls) = ~0.6 s at ~160 ms/round-trip. Confirms audit F4/F5 direction: round-trip *count* is the dominant production lever (network-bound, not query-bound). | all pages | Every page pays ~160 ms × its query count | Medium | Spans several audit items (batching, streaming, caching) |
| N3 | Chat thread with 100+ messages loaded (after two "Load older") keeps 100+ DOM bubbles; scrolling stays smooth at this size but the audit's F1 recommendation (windowed rendering) becomes relevant beyond ~500. | `ChatClient.tsx` | Future-only | Low | Medium |
| N4 | Dev-environment recompiles inject 3–5 s outliers into otherwise stable timings (S1 max 5,352 ms vs 1,572 min) — a dev-only artifact, but it makes local performance measurement noisy. | Turbopack dev | Measurement noise only | Info | — |

## Incidents observed (outside the load test)

- Before seeding, the earlier QA fixtures' `coaches` row (and 3 other coach rows) had been **deleted externally** — the QA coach could no longer resolve `coaches.id`. Per spec §1.1 the load test therefore created its own tagged test coach instead of reusing it. No action taken on the deleted rows.
- Related standing issue (from the audit/summary known-issues): `stripe_account_id` lives on `coaches` while the revenue/settings code reads `profiles` — this is why fix #2's path is inert.

## Cleanup status (Phase 1.4 — completed and verified)

All manifest rows were deleted in FK-safe order (sets → sessions → generated assignments → enrollments → messages → conversations → 15 storage objects → subscriptions → profiles → auth users), plus the test coach's own rows (program days, program, templates, 102 trigger-created notifications, coach row, profile, auth user) which the first cleanup pass missed.

**Post-cleanup verification (executed, not claimed):**

```
profiles (email pattern):        0
profiles (name prefix):          0
subscriptions (loadtest clients): 0
conversations (loadtest):        0
enrollments (loadtest):          0
auth.users remaining (by manifest): 0
```

**Real-data spot check after cleanup:** 4 coach rows / 14 coach profiles remain (the live mobile-app coaches), 105 workout assignments, 54 messages, 9 conversations — all pre-existing data intact; nothing matching the load-test patterns remains.

## Phase 2

Not started — awaiting review of this report and explicit go-ahead.
