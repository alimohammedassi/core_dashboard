# Live Security Probe Report — 2026-10-02

Empirical verification against production Supabase `mkrjvrnysuvtokqkyoll` (shared dashboard + Flutter).
Probes: `scripts/probes-2026-10-02/` (PostgREST anon/authenticated/service + Management-API SQL, read-only unless noted).
Catalog dump: `docs/live-db-introspection-2026-10-02/` (60 tables, 182 policies, 39 functions w/ sources, 2 publications, 32 storage policies, 138 indexes, 16 triggers).

## Verified matrix (status-code level; no PII exported)

| Probe | Result | Verdict |
| --- | --- | --- |
| S-01 anon `profiles select=*` | **200, 2 rows, 13 cols** (full PII incl. email/age/weight) | **VULNERABLE** — live policy `profiles_select_public` exposes every `role='coach'` row to anon |
| S-02 anon `coaches select=*` | **200, 2 rows, 11 cols** (incl. `stripe_account_id`, `user_id`) | **VULNERABLE** — live `coaches_read_all` (`is_active = true`) |
| S-07 anon `subscription_plans` | 200, 0 rows | OK (no anon leak) |
| S-07 coach reads OWN plans | **200, 0 rows** | **BROKEN (fail-closed)** — `coach_manage_own_plans` compares `coach_id = auth.uid()` (never true) |
| S-05 anon `coach_onboarding` | 200, 0 rows | OK for anon; authenticated-public marketplace read is the intended contract |
| S-04 anon `coach_content` | 200, 0 rows | Table OK (bucket-level issue = storage audit F1) |
| anon conversations / messages | 200, 0 rows / anon INSERT → **401** | OK |
| Cross-tenant reads (auth coach → foreign plan/template/conversation by id) | 200, **0 rows** each | RLS deny verified |
| **S-03 cross-tenant conversation INSERT** (coach + foreign client w/o subscription) | **201 CREATED** | **VULNERABLE** — no subscription check in either INSERT policy. Test row `a65258a4…` deleted immediately (204, verified). Also accepts `client_id IS NULL` (no live null rows exist; probe row cleaned) |
| RPC negative: `create_program_enrollment_atomic` w/ foreign program | **P0001 'Program not found or not owned by this coach'**, no writes | Fails closed ✓ |
| Existing-conversation integrity | 15 total; 0 dup pairs; 0 null-endpoint; **3 "cross-tenant" = one QA client whose 3 subs were cancelled (historical, pre-audit fixtures — KEPT)** | No abuse evidence |

## Live RPC authorization verdict (from `function_sources.json`)

- `apply_coach_meal_edit` **IS NOW LIVE** with ownership check + pinned `search_path` (LV4 deploy-gap closed since Sep 27).
- All mutating RPCs (`*_atomic`, `regenerate_*`, `apply_*`, `mark_conversation_read`, `unread_count`) are SECURITY DEFINER with in-body `auth.uid()`/coach-ownership checks and EXECUTE restricted to authenticated+service_role. No anon EXECUTE on any mutating RPC.
- Gaps: `create_program_enrollment_atomic` lacks the 1–52 duration cap (nutrition twin has it) → `api01` still needed; 7 SECURITY DEFINER functions without pinned `search_path` (`is_my_active_client`, `handle_subscription_accepted`, `sync_workout_to_summary`, `sync_nutrition_to_summary`, `notify_new_message`, `update_coach_rating`, `update_conversation_on_message`) → `db04` still needed; `prevent_role_escalation` still ABSENT → `db06` still needed (product decision pending).
- Public-EXECUTE leftovers (minor): `record_daily_activity`, `get_streak_status` (mobile analytics reads; tighten in db04 batch).

## Realtime (F-20) — root-cause correction

`supabase_realtime` publication **already contains** `conversations`, `messages`, all `messages_2026_10_*` day-partitions, and `notifications` (2nd publication `supabase_realtime_messages_publication` also exists). The "missing publication membership" hypothesis is DEAD. Remaining candidate causes are client-side (filter shape / partition quirks / RLS-allowed-but-socket-state) → E2E live test decides. `db08` migration is **NOT needed** — do not add tables redundantly.

## Conversation-data findings feeding db09

- No unique index on `conversations(coach_id, client_id)`; 0 duplicate pairs live.
- `participants_can_update_messages` permits a participant to rewrite the other party's message content (only `is_read` legitimately needs participant-wide UPDATE).
- Fix prepared: `supabase/remediation-2026-10-02/db09_conversation_security.sql` (+rollback) — **NOT EXECUTED, awaiting explicit authorization** (see DDL authorization request in remediation log).
