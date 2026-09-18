# QA Fixture Cleanup Manifest — PROPOSAL, NOT EXECUTED

**Status:** awaiting owner approval of this exact manifest. **Nothing has been
deleted.** Verified live 2026-09-15 via the Management API SQL runner
(read-only queries).

## Context

The load-test cleanup (2026-09-14) removed all `[LOADTEST]` data — verified
again today: 0 `[LOADTEST]` templates/programs/clients/subscriptions remain,
and the loadtest coach/clients auth users are gone. What remains is the older
QA fixture pair, partially damaged by an external deletion of the QA coach's
`coaches` row (not by any session — observed 2026-09-14).

## Current live state (exact)

| Item | Rows | IDs |
|---|---|---|
| auth user — QA coach | 1 | `15c0f5a9-f546-4e38-bcd2-eaf76f1e3dee` (qa.coach.0912@coregymtest.dev, profile role=coach, **no `coaches` row** → dashboard shows empty data) |
| auth user — QA client | 1 | `7512b8fb-1639-4a4b-b4eb-6f0b891d45df` (qa.client.0913@coregymtest.dev, recreated externally after the earlier deletion; profile `name` empty) |
| conversations | 1 | `25135ced-6b14-4326-a762-0745ecd4f232` (client 7512b8fb ↔ coach uid 15c0f5a9; `coach_unread` = 64 — stale counter, only 9 messages exist) |
| messages | 9 | all in conversation `25135ced…` |
| notifications | 5 | `8ad3b4a6…`, `2dbaaa6b…`, `46d18533…`, `fb539488…`, `534a692f…` (all `user_id = 7512b8fb…`) |
| subscriptions / assignments / sessions / templates / programs for these users | 0 | — |
| Real coaches | 5 | untouched, none linked to the QA pair |

## Option A — DELETE (proposed SQL; run only after approval)

FK-safe order (children first). Run in the Supabase SQL Editor / Management
API, one statement at a time, verifying counts between steps:

```sql
-- 1. messages of the QA conversation (expect 9)
with d as (delete from public.messages
           where conversation_id = '25135ced-6b14-4326-a762-0745ecd4f232'
           returning 1)
select count(*) as deleted_messages from d;

-- 2. the QA conversation (expect 1)
with d as (delete from public.conversations
           where id = '25135ced-6b14-4326-a762-0745ecd4f232' returning 1)
select count(*) as deleted_conversations from d;

-- 3. QA client notifications (expect 5)
with d as (delete from public.notifications
           where user_id = '7512b8fb-1639-4a4b-b4eb-6f0b891d45df' returning 1)
select count(*) as deleted_notifications from d;

-- 4. profiles (expect 2)
with d as (delete from public.profiles
           where id in ('15c0f5a9-f546-4e38-bcd2-eaf76f1e3dee',
                        '7512b8fb-1639-4a4b-b4eb-6f0b891d45df') returning 1)
select count(*) as deleted_profiles from d;

-- 5. auth users — LAST (profile rows are trigger-created from auth users)
delete from auth.users
where id in ('15c0f5a9-f546-4e38-bcd2-eaf76f1e3dee',
             '7512b8fb-1639-4a4b-b4eb-6f0b891d45df');
```

If storage objects exist in the chat buckets under the conversation id, delete
them from `storage.objects` where `path_tokens[1] =
'25135ced-6b14-4326-a762-0745ecd4f232'` (verify first with a SELECT).

**Post-checks (all must return 0):**

```sql
select count(*) from auth.users
 where email in ('qa.coach.0912@coregymtest.dev','qa.client.0913@coregymtest.dev');
select count(*) from public.conversations
 where id = '25135ced-6b14-4326-a762-0745ecd4f232';
select count(*) from public.notifications
 where user_id = '7512b8fb-1639-4a4b-b4eb-6f0b891d45df';
```

## Option B — RESTORE (alternative)

If the owner wants to keep a working QA fixture: recreate the coach row
(`insert into coaches (user_id, ...) values ('15c0f5a9-…', ...)`) and a
subscription from the QA client; the auth users/profiles/conversation already
exist. Decide: delete vs restore — do not leave the half-deleted pair in place
(its dashboard pages render honest empty states today, which is safe but
useless as a fixture).

## Out of scope / untouched

- The 5 real `coaches` rows and all real client data.
- `.qa-*.mjs` helper scripts (repo root, untracked, gitignored — keep until
  the QA environment decision; contain no secrets).
