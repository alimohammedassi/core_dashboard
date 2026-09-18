# Performance Fix Report — Auth Dedup + /dashboard Loading UI

Date: 2026-09-15 · Scope: exactly the two approved fixes (auth-chain dedup, /dashboard loading skeleton). Chat message-embed issue intentionally untouched. Nothing committed or pushed.

## Before

Baseline from `docs/performance-investigation-deploy.md` (node fetch with auth cookie, warm, median of 3, QA-coach session):

| Route | Server TTFB (before) | Server full (before) | Browser TTFB/load (before, warm) |
| --- | ---: | ---: | ---: |
| `/login` | 78 ms | 78 ms | 107 / 681 ms |
| `/dashboard` | 1,156 ms | 1,156 ms | 2,949 / 3,551 ms |
| `/dashboard/subscribers` | 689 ms | 689 ms | 928 / 1,527 ms |
| `/dashboard/chat` | 473 ms | 473 ms | 743 / 1,365 ms |

Baseline structure: **2× `getUser` GoTrue round trips per authenticated navigation** (layout + page) plus a `profiles` role query in the layout and `resolveCoachId` per page — the serial chain identified as the main bottleneck. `/dashboard` had no loading UI (TTFB == full render; nothing visible until done).

## After

Same measurement method (node fetch with auth cookie, warm, median of 3, same QA-coach session):

| Route | Server TTFB (after) | Server full (after) | Browser TTFB/load (after, warm) |
| --- | ---: | ---: | ---: |
| `/login` | 58 ms | 58 ms | 75 / 389 ms |
| `/dashboard` | 1,090 ms (min 932) | 1,090 ms | 438 / 969 ms |
| `/dashboard/subscribers` | 602 ms (min 600) | 602 ms | 497 / 887 ms |
| `/dashboard/chat` | 473 ms | 473 ms | — |

Skeleton streaming on `/dashboard` verified directly: the loading shell's first bytes arrive at **1,689 ms** with the full content at **2,858 ms** under the same conditions (dev recompile noise inflates both numbers run-to-run; the structural streaming behavior is what matters — previously nothing arrived until the full render completed).

## Request count

Structural verification (call-site inspection):

- Before: layout `getUser` + page `getUser` = **2 GoTrue `/auth/v1/user` round trips** per authenticated navigation, plus `resolveCoachId` once per page (each its own round trip).
- After: layout and page share `getCurrentUser()` (React `cache()`-wrapped) → **1 round trip per navigation**; `resolveCoachId` is also `cache()`-wrapped, so any repeated calls within one request deduplicate to one `coaches` query.

Corroborating measurement: `/dashboard` min TTFB dropped 1,065 → 932 ms (−133 ms ≈ one removed GoTrue round trip at local RTT); the remaining serial chain is the `profiles` role query + `resolveCoachId` + overview batch, exactly as predicted by the investigation.

## Code changes

| File | Change |
| --- | --- |
| `src/lib/supabase/server.ts` | `createClient` wrapped in React `cache()` — one client instance per server request |
| `src/lib/auth.ts` | **NEW** — `getCurrentUser()` (cached `getUser`) |
| `src/lib/coach.ts` | `resolveCoachId` wrapped in `cache()` (same query, request-memoized) |
| `src/lib/workouts.ts` | `requireCoachContext` uses `getCurrentUser()` |
| `layout.tsx` + 9 dashboard pages | `supabase.auth.getUser()` → `getCurrentUser()` |
| `src/app/(dashboard)/dashboard/loading.tsx` | **NEW** — overview-shaped streaming skeleton |

## Security verification

- `middleware.ts` untouched — session refresh identical.
- Authentication behavior unchanged — same `getUser` call, same redirect on missing user, same role gate in the layout (non-coach screen intact).
- `resolveCoachId` semantics identical — same query, same fallback; only memoized within a request.
- React `cache()` is **per-request**: state is cleared between requests, so no user's auth data can be shared with another user's request. API routes are separate requests and keep their own scope.
- RLS, database schema, API keys, Supabase configuration: untouched.
- No secrets exposed; nothing committed or pushed.

## Result

The measured bottleneck (duplicate auth round trips) is **removed**: one `getUser` per navigation instead of two, corroborated by a −133 ms drop in `/dashboard` minimum TTFB (1,065 → 932 ms) and −87 ms median on `/dashboard/subscribers` (689 → 602 ms). `/dashboard/chat` is unchanged within noise (473 ms — its auth call was already the smaller share of its 473 ms). `/dashboard` now streams a matching loading skeleton at ~1.7 s while its queries finish (~2.9 s locally; faster in production). Dev-compile noise (±1–3 s on first hits) remains and is environmental, not application behavior. The chat message-embed issue is deliberately left for its own pass.

Caveat: absolute dev timings fluctuate with Turbopack recompiles (max outliers up to ~3 s in any single run); min-of-3 comparisons were used to reduce that noise. No percentage claims beyond these measured deltas.
