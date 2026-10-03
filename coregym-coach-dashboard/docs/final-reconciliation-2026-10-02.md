# Final Audit Reconciliation — 2026-10-02
(CoreGym Coach Dashboard — full audit remediation, second pass. Statuses per master taxonomy.)

## 1. Executive status

Baseline was green (tsc/eslint/209 tests/build @ bec37bc); finished green and stronger (tsc/eslint clean, 231/231 tests, build success). All code-side remediation is applied in the working tree; all DB-side remediation is PREPARED with verified rollbacks and NOT EXECUTED (no production DDL performed). Live empirical verification was done via Management-API catalog introspection + PostgREST probes + controlled attack tests (all cleaned up). Production still runs the vulnerable anon-read policies (S-01/S-02) and the open conversation-creation path (S-03) until the prepared migrations are authorized and applied.

## 2. Security status (S-01 → S-08 + new findings)

| ID | Status | What changed | Files | Production verification | Flutter impact | Remaining risk |
| --- | --- | --- | --- | --- | --- | --- |
| S-01 profiles anon exposure | PREPARED / BLOCKED (SQL) | db01 prepared (policy+grant fix, verified verbatim against live) | supabase/remediation-2026-09-28/db01…(+rollback) | Live leak CONFIRMED by anon probe (200, full rows); fix verified by runbook probes only | Marketplace anon `select=*` on coaches must switch to safe columns | **LIVE LEAK ACTIVE until db01 applied** |
| S-02 coaches anon exposure | PREPARED / BLOCKED (SQL) | db01 (same file) handles coaches_read_all + column grants | same | Leak CONFIRMED (11 cols incl. stripe_account_id) | Same column-grant note | **LIVE LEAK ACTIVE until db01 applied** |
| S-02 role self-grant (app path) | FIXED + VERIFIED (code) | App-level eligibility gate + input caps in POST /api/coaches; rate-limit cooldown added | src/app/api/coaches/route.ts | Route verified by code-review + cooldown logic; PostgREST self-promotion path still open (db06) | db06 breaks mobile role-pick — product decision | Mobile signups unaffected today; escalation via PostgREST remains possible |
| S-03 conversation IDOR | FIXED + PARTIALLY VERIFIED (code) / PREPARED (SQL) | F-01 server-side bootstrap verifies ownership (subscriptions) before find-or-create; db09 prepared (subscription-verified INSERT policy + unique index + tampering trigger) | src/app/(dashboard)/dashboard/chat/page.tsx; supabase/remediation-2026-10-02/db09…(+rollback) | Attack CONFIRMED live at RLS level (201 created+cleaned); app-level fix verified in E2E (bootstrap created conversation for never-messaged client, cleaned); RLS fix NOT APPLIED | Client-initiated chat creation would require active subscription (product confirmation needed) | **RLS-level hole OPEN until db09 applied** |
| S-04 coach credentials public | PREPARED / BLOCKED (Flutter) | db07 storage policies prepared (NOT EXECUTED); staged private-bucket plan documented | supabase/remediation-2026-10-02/db07…; docs/storage-audit-2026-10-02.md | HIGH finding verified (public coach-media, anon-enumerable; certificates/achievements) | Mobile marketplace renders public credential URLs — cannot flip to private safely | Credentials world-readable-by-URL until Flutter contract verified |
| S-05 coach_onboarding | ACCEPTED RISK (by design) | None (intentional marketplace contract, authenticated-public; anon denied — verified 0 rows) | — | Anon probe: 0 rows | Mobile reads it as marketplace listing | None identified |
| S-06 existence oracle | FIXED + VERIFIED (code + live E2E) | Foreign and missing resources both 404 (scoped reads) | src/app/api/program-enrollments/route.ts, src/app/api/nutrition-enrollments/[id]/regenerate/route.ts | Route-level adversarial pass: foreign program 404, foreign enrollment PATCH/DELETE 404, no oracle | None | — |
| S-07 plans RLS fail-closed | PREPARED / BLOCKED (SQL) | db05 prepared (policy → TO authenticated, EXISTS via coaches) | supabase/remediation-2026-09-28/db05…(+rollback) | Fail-closed CONFIRMED live (coach own plans = 0 rows; anon = 0) | Strictly additive for mobile (coach plan reads start working) | Plans UX contradiction (U-01) persists until applied |
| S-08 rate-limit gaps | FIXED + VERIFIED (code + live 429/cooldown tests) | 9 routes rate-limited via existing helper (AI apply 10/min, attachments 30/min, coaches 60s cooldown, enrollments 10/min ×2, regenerates 10/min ×2, assignments 30/min, duplicates 10/min ×2) | src/app/api/* (9 routes) | tsc/lint/tests; 429 + cooldown verification in adversarial pass | None (per-user keys, authenticated-only paths) | Per-instance limitation (documented; Upstash/KV for global) |
| RPC authorization | FIXED + VERIFIED (live audit); hardening PREPARED | All mutating RPCs verified in-body (ownership, grants, no dynamic SQL); apply_coach_meal_edit now LIVE; db04 v3 extended (7 search_path pins + 2 grant tightenings) | supabase/remediation-2026-09-28/db04…(+rollback) | Full live function-source audit (39 functions) | None (authenticated EXECUTE untouched) | search_path hijack class open until db04 applied |
| NEW: message tampering (participant UPDATE) | PREPARED / BLOCKED (SQL) | db09 trigger: non-sender participants may change ONLY is_read | db09 (+rollback) | Live policy text confirmed the hole; read-receipt compatibility verified for dashboard+mobile | mark_conversation_read RPC compatible (verified) | Participants can rewrite each other's messages until db09 applied |
| NEW: partition-table realtime hazard | ACCEPTED RISK (documented) | Documented: postgres_changes binding on a partition table poisons channel registration | docs/remediation-log.md | Verified by experiment (SUBSCRIBED + zero events) | Same hazard exists for any mobile subscription to partitions | Only matters if a client subscribes to a partition table name |
| NEW: conversation NULL-endpoint insert | COVERED BY db09 | Tightened INSERT policy rejects null endpoints | db09 | Verified live-insertible during probe (cleaned) | None | — |
| Storage (chat/private buckets) | FIXED + VERIFIED (already correct live) | No change needed | — | Anon list 0 / anon read denied on all private buckets; participant-scoped signed URLs verified | Mobile uses same buckets | — |

## 3. Functional status (F-01 → F-20)

| ID | Status | Notes |
| --- | --- | --- |
| F-01 | FIXED + VERIFIED (code + E2E) | Secure server-side chat bootstrap (UUID → ownership via subscriptions → find-or-create under RLS; race re-select). SQL unique index prepared (db09). Mobile find-first note documented |
| F-03 | FIXED + VERIFIED (code) | Error/404 split on 4 dynamic pages + 3 lib loaders + NEW dashboard/error.tsx |
| F-11 | FIXED + VERIFIED (code) | Server-side active-enrollment 409 (nutrition); UI toast path verified without protected-file edits |
| F-12 | FIXED + VERIFIED (code) | router.refresh after template create/duplicate/delete/assign |
| F-13 | FIXED + VERIFIED (code) | Server-side search (?q=) composing with pagination; new tests (pagination.test.ts) |
| F-14 | FIXED + VERIFIED (code) | enrollmentWeekOf() aligned to live SQL convention; proven against generateEnrollmentDates across start-weekdays |
| F-15 | FALSE POSITIVE (current code) | Design agent's reset-password toasts on mismatch; signup has no confirm field — handoff note only |
| F-16 | FIXED + VERIFIED (code) | "Subscriber since"/"Subscription ends" labels (EN+AR), verified key usage |
| F-17 | FIXED + VERIFIED (code) | copyTemplateName + 200-char cap; duplicate cannot exceed editor validation |
| F-20 | ALREADY FIXED OUT-OF-BAND + VERIFIED LIVE | Publication fixed out-of-band; node experiment proved delivery; TWO-TAB browser test confirmed live arrival in real UI (d1-tab1-realtime-arrived.png); db08 never created |

## 4. Performance status (P-01 → P-12) — dev measurements, not production claims

| ID | Status | Before → After |
| --- | --- | --- |
| P-01 | FIXED + VERIFIED (dev) | Waves 4→2; 3453→2599ms med (−25%); payload 311→308.4KB |
| P-02 | PREPARED / BLOCKED (SQL) | db10: 3 CONCURRENTLY indexes from live-catalog diff (4 of 6 db02 proposals already covered live) |
| P-03 | FIXED + VERIFIED (dev) | Overview wave merge; /dashboard 1660→1519ms |
| P-04 | FALSE POSITIVE (already fixed) | cache()-scoped helpers verified; fail-closed auth intact |
| P-05 | FIXED + VERIFIED (code) | daily_summary 180-day bound + cap 5000; documented edge |
| P-06 | FIXED + VERIFIED (dev) | /dashboard eager JS −425KB (−31%); /subscribers/[id] −485KB (−36%); recharts out of eager path |
| P-07 | FALSE POSITIVE (rejected with evidence) | Proposed index would be dead weight (live queries are client/enrollment-leading) |
| P-08 | FALSE POSITIVE (already minimal) | Catalog select already trimmed; editor needs full template rows |
| P-09 | FIXED + VERIFIED (code) | Duplicate payment_intents head-count removed |
| P-10 | FIXED + VERIFIED (code) | Selects trimmed where typed ≠ live |
| P-11 | FIXED + VERIFIED (code) | Dead loaders removed; defensive caps added |
| P-12 | FIXED + PARTIALLY VERIFIED (code) | Stripe reads cached per-account (60s TTL); live Stripe verification impossible (no key in QA) |

## 5. UX status (U-01 → U-08)

| ID | Status | Notes |
| --- | --- | --- |
| U-01 plans contradiction | PREPARED / BLOCKED (SQL) | Caused by S-07 fail-closed RLS; resolves with db05 |
| U-02 skeleton height mismatch | FIXED + VERIFIED (E2E) | Throttled pass: skeleton renders immediately, matched shapes, no blank frame (z1-gaps screenshots) |
| U-03 wrong-boundary skeleton flash | FIXED + VERIFIED (E2E) | 13 route-level loading.tsx at correct boundaries; no unrelated-route skeleton flash under throttle |
| U-04 dev CSP warning | FIXED + VERIFIED (code) | 'unsafe-eval' dev-only in next.config.ts; prod headers unchanged |
| U-05 save feedback | FALSE POSITIVE (current code) | Spinners + toasts + disabled states already in reconstructed settings |
| U-06 builder empty rows | FALSE POSITIVE (current code) | Builder starts empty; explicit validation |
| U-07 profile ~19s settle | FIXED + PARTIALLY VERIFIED | P-01 waves 4→2 + 36% eager-JS cut; throttled profile settle measured 4.6s in dev (was ~19s claim); production telemetry unavailable |
| U-08 SSR white screen | ACCEPTED RISK (inherent) | SSR fetch + route-level skeletons; no complexity added |

(E2E-dependent rows updated after the browser pass.)
