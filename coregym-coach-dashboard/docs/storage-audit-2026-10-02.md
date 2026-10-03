# Storage Security Audit — 2026-10-02

Scope: Supabase Storage layer of the CoreGym coach dashboard (Next.js) and the shared production
Supabase project (`mkrjvrnysuvtokqkyoll`) also used by the Flutter mobile app (not locally
available — mobile conventions verified from repo documentation and live path shapes only).
Auditor: STORAGE SECURITY agent. Read-only; all live probes are status-code/metadata level
(no object bodies fetched, no secret values printed, no identifiers or filenames reproduced
in this report).

Related remediation: `supabase/remediation-2026-10-02/db07_storage_policies.sql` (**NOT EXECUTED**)
+ matching rollback. Probe driver: `scripts/probes-2026-10-02/probe-storage.mjs`.

---

## 1. Live bucket inventory (service-key GET /storage/v1/bucket, 2026-10-02)

Verified identical to the 2026-09-27 list: `avatars` (public), `coach-media` (public),
`coach-pdfs` (public), `food-images` (public), `food-scans` (private), `voice-food-logs`
(private), `chat-voice-notes` (private), `chat-images` (private), `chat-files` (private).

Exact live policy definitions on `storage.objects` remain UNKNOWN (no catalog access), but the
probes below establish the behavior boundaries empirically. No repo migration contains any
`storage.objects` policy (confirmed by production-audit-report DB1 and re-verified by grep).

## 2. Per-bucket audit table

Read path legend: "public URL" = `getPublicUrl()` persisted in a DB column and rendered directly;
"signed URL" = short-lived `createSignedUrl()` minted by a service-role API route.
Probe columns: anon = anonymous key; "foreign-auth" = authenticated QA-coach JWT acting on
objects whose path segment 1 is NOT theirs (not their uid, not a conversation they participate in).

| Bucket | Public flag | What is uploaded (writer) | Upload authz | Read path | Anon list | Anon read | Foreign-auth read / write | Verdict |
|---|---|---|---|---|---|---|---|---|
| `avatars` | public | Profile photos `{uid}/avatar.{ext}` (dashboard Settings + onboarding, client-side supabase-js; mobile assumed same convention) | Supabase RLS on storage.objects (live; foreign-auth write probe → 400 denied). Client-side MIME/5 MB checks only | Public URL persisted in `profiles.avatar_url` (`?v=` cache-buster); rendered dashboard-wide + marketplace | 200, 3 entries (enumerable by design) | 200 (by design) | read 200 (public bucket, by design) / write 400 denied | OK-by-design; public-read required for rendering. uid paths enumerable (F4) |
| `coach-media` | public | Marketplace media AND coach achievements/certificates `{uid}/{millis}_{name}` (dashboard `CredentialsManager` via XHR PUT/POST with Bearer session; mobile writes marketplace items) | RLS (live; foreign-auth write probe into another user's folder → denied). Client-side type/50 MB checks | Public URL persisted in `coach_content.file_url` (`is_public: true`) | 200, 5–8 entries (enumerable) | 200 (by design) | read 200 (by design) / write denied (probe on avatars equivalent) | **HIGH — F1**: certificates/qualifications are world-readable-by-URL in a public bucket |
| `coach-pdfs` | public | Marketplace coach PDFs (mobile only; NO reference in this repo) | RLS (live) | Public URL (assumed mobile convention) | 200, 0 entries (bucket empty) | n/a (empty) | n/a | OK (empty; model mirrors coach-media) |
| `food-images` | public | Seeded food catalog images, path `foods/...` (no writer in this repo; service-seeded) | No authenticated writer expected | Public URL | 200, 1 entry (enumerable) | 200 (by design) | read 200 (by design) | OK-by-design; static catalog, no user data observed |
| `food-scans` | private | Meal-scan photos `{uid}/...` (mobile app only; no repo reference) | RLS (live) | Mobile-app internal (signed URLs assumed) | 200, 0 (RLS-filtered) | 400 denied | read 400 / write n.t.* | OK — private boundary verified |
| `voice-food-logs` | private | Voice food-log audio `{uid}/...` (mobile app only) | RLS (live) | Mobile-app internal | 200, 0 (RLS-filtered) | 400 denied | read 400 / write n.t.* | OK — private boundary verified |
| `chat-images` | private | Chat photos `{conversationId}/{millis}_{name}` (dashboard `POST /api/chat/upload` via service role + mobile app) | Route-level: auth → participant check (conversations coach_id/client_id) → size/MIME/content-sniff; then service-role upload. Storage RLS: foreign-auth write denied live | 15-min signed URLs via `POST /api/chat/attachments` (participant-verified) | 200, 0 (RLS-filtered) | 400 denied | read 400 / write denied | OK — participant model verified at boundaries |
| `chat-voice-notes` | private | Chat voice notes `{conversationId}/{millis}_chat_voice_{millis}.{ext}` (same two writers) | Same as chat-images | Same | 200, 0 (RLS-filtered) | 400 denied | read 400 / write n.t.* | OK — participant model verified at boundaries |
| `chat-files` | private | Chat generic files `{conversationId}/{millis}_{name}` (same two writers; active-content blocklist + forced `download` disposition) | Same as chat-images | Same | 200, 0 (RLS-filtered) | 400 denied | read 400 / write 400 denied (probe attempted upload into foreign conversation folder) | OK — participant model verified at boundaries |

\* n.t. = not tested (write probes were limited to chat-files, avatars, and the anonymous
chat-files attempt to minimize write surface; every probe that DID run denied correctly).

## 3. Repo-side usage inventory (complete)

All `.storage` interactions in `src/` (grep-verified; no other references anywhere in the repo,
including middleware and SQL migrations):

- `src/components/settings/SettingsSections.tsx` — avatar upload (`avatars`, upsert), `getPublicUrl`
  → `profiles.avatar_url`, remove. Client-side, authenticated session. Path `{userId}/avatar.{ext}`.
- `src/components/settings/CredentialsManager.tsx` — achievements/certificates upload to
  **`coach-media`** via XHR with the user's access token; `getPublicUrl` → `coach_content.file_url`
  with `is_public: true`; remove/replace deletes the storage object with the owner's own session.
  Path `{userId}/{Date.now()}_{sanitized}`.
- `src/app/api/chat/upload/route.ts` — authenticated route: rate limit (20/min), participant check
  via `conversations`, size/MIME/extension limits, magic-byte content sniffing (active markup
  rejected), service-role upload to `chat-images` / `chat-voice-notes` / `chat-files`, orphan
  cleanup on message-insert failure.
- `src/app/api/chat/attachments/route.ts` — mints 15-minute signed URLs after a participant check;
  batch path (≤50) with per-message participant verification; `download` disposition forced for
  `chat-files`.
- `src/lib/chat-media.ts` — bucket map, limits, TTL (15 min), content-sniffing helpers.
- Renders (`ChatClient.tsx`, `MediaMessage.tsx`, lists/topbar) consume only DB columns
  (`messages.file_url` → signed URL route; `profiles.avatar_url` → direct public URL).

Buckets with NO web-repo footprint (mobile-app-only): `coach-pdfs`, `food-images`,
`food-scans`, `voice-food-logs`.

**Intended-visibility classification (code + docs/product-workflow.md):**
- Marketplace/intentionally public: `coach-media`, `coach-pdfs`, `food-images` — coach-media holds
  `coach_content` marketplace media (types `image`/`video`/`pdf`) per
  `supabase/coach_content_type_migration.sql`, rendered via public URLs. product-workflow.md
  documents chat storage as private/participant-scoped; avatars public-read is required because
  `profiles.avatar_url` stores a public URL rendered across the app.
- Private: `chat-*` (participant-scoped signed URLs), `food-scans`, `voice-food-logs`.
- avatars: public by design (rendering requirement) — confirmed.

**Credentials special-attention result:** coach achievements AND certificates (qualifications
documents) are uploaded by `CredentialsManager.tsx` into the **public `coach-media` bucket** and
persisted as **public URLs** in `coach_content` (`is_public: true`; the UI even labels the action
"Honest visibility check: the file really opens at its public URL"). There is no separate
credentials bucket. See finding F1.

## 4. Live probe results (2026-10-02, `scripts/probes-2026-10-02/probe-storage.mjs`)

43 recorded observations; UUID values redacted here (full shapes printed only as
`{bucket}/{uuid}/...` by the script; no filenames, no bodies):

- Bucket flags: match §1 exactly.
- Anonymous object-list (`{limit:5}`): avatars 3, coach-media 5, food-images 1, coach-pdfs 0
  (public — enumerable by design); all five private buckets → 0 entries (RLS-filtered, no leak).
- Anonymous read (HEAD) of one real object per bucket: public buckets 200 (by design);
  all private buckets **400** (denied) — paths obtained via service-role listing, so objects exist.
- Anonymous upload attempt (`chat-files/audit-probe-20261002/...txt`, 19 bytes): **400 "Unauthorized"
  — denied**; nothing created (defensive cleanup returned 400/not-found as expected).
- Authenticated (QA coach, 10 conversations via PostgREST RLS view):
  - list on all 5 private buckets: 0 foreign top-level entries (scoped);
  - HEAD on a foreign object in every private bucket: **400 — protected**;
  - HEAD on foreign objects in public buckets: 200 (public-by-design);
  - **write probes: upload into a foreign user's `avatars/{other-uid}/` folder → 400 denied;
    upload into a foreign conversation's `chat-files/` folder → 400 denied.** Nothing created.
- Public-bucket sizing (counts only, names withheld): avatars 3 objects / 3 owners;
  coach-media 8 / 8; food-images 1 / 1; coach-pdfs 0.

**No anon or cross-tenant authenticated leak observed at the status-code level on any of the
four tested boundaries (list / read / write / upload) for private buckets, and no
authenticated-foreign write on the tested public bucket.**

## 5. Findings

| ID | Severity | Finding | Evidence | Remediation |
|---|---|---|---|---|
| F1 | **HIGH** | Coach **certificates/qualifications and achievements are stored in the public `coach-media` bucket** as permanent public URLs (`coach_content.file_url`, `is_public: true`), in a bucket that anonymous users can also **enumerate** (list returns entries). Certificates are professional documents (name, issuing body, potentially ID numbers — content unverifiable without reading bodies, out of scope). This is currently an intentional product behavior (UI advertises the public URL), which is why it is HIGH, not CRITICAL; it becomes CRITICAL if any certificate contains government/national IDs. | `CredentialsManager.tsx:99,108,140-149,308-318`; probe: coach-media anon list ≥5 entries, anon read 200 | Cannot be fixed SQL-only (app renders public URLs). Staged fix: (1) create private bucket `coach-credentials`; (2) app change: upload there + render via participant/owner-gated signed URLs (pattern already exists in chat attachments route); (3) service-role migration of existing credential objects + DB `file_url` rewrite; (4) delete migrated public objects. Until applied, scope the bucket's anon-list policy away (keep `/object/public/` GET) to at least stop enumeration — optional hardening listed in db07 runbook notes |
| F2 | **MEDIUM** | The live `storage.objects` policy set exists (RLS demonstrably enforced) but is **absent from all migrations/version control** — unrecoverable, unreviewable, one dashboard edit from silent widening. Behavior probes also suggest chat-bucket SELECT is owner-scoped rather than participant-scoped: the QA coach (participant of 10 conversations, load-test media present) lists **0** top-level entries in all chat buckets, so counterpart media is only reachable via service-role signed URLs today. | §4 probes; production-audit-report DB1; product-workflow.md:350 ("storage policies scope path segment 1 to conversation participants") | `db07_storage_policies.sql` codifies the intended least-privilege set (33 policies, `db07_stg_*` prefix) — NOT EXECUTED; runbook requires introspection + path-convention pre-flight before apply |
| F3 | LOW | Public buckets are anonymous-enumerable (object list returns entries). Inherent to public buckets as currently used; matters mainly for coach-media because it holds certificates (see F1). | §4 probes | Optional: revoke anon SELECT on storage.objects for public buckets while keeping `/object/public/` GET (which does not need the policy). Deferred — may affect mobile listing behavior; decide with mobile team |
| F4 | LOW | Path-identifier leakage: path segment 1 is a user UUID (`avatars`, `coach-media`, `food-scans`, `voice-food-logs`) or conversation UUID (`chat-*`). On public buckets these UUIDs are exposed to anyone who lists; they are stable identifiers linkable to `profiles` (avatars/coach-media URLs are public anyway). On private buckets they are visible only to the object owner/service role, and knowledge of a path grants nothing (read denied without signature; chat signed URLs are participant-minted, 15-min TTL). Chat paths do NOT embed user IDs (conversation IDs only), so per-message path disclosure through the DB would reveal conversation ids, not uids. | §2, §4 | None required now; keep conventions as-is. If F1 is remediated with a private credentials bucket, keep uid-path scoping |
| F5 | INFO | No leak observed: all 43 status-code probes behaved least-privilege (private buckets deny anon and foreign-authenticated list/read/write; public buckets readable by design; foreign-auth write into another user's avatar folder denied). | §4 | Maintain: db07 codification + post-apply re-probe (runbook step 4) |

## 6. Files created (this audit)

- `scripts/probes-2026-10-02/probe-storage.mjs` — read-only probe driver (status-code level; one
  19-byte tagged write probe per target with immediate service-role cleanup on success; none succeeded).
- `supabase/remediation-2026-10-02/db07_storage_policies.sql` — **NOT EXECUTED**; introspect →
  pre-flight → apply → verify runbook; 33 `db07_stg_*` policies; drops nothing.
- `supabase/remediation-2026-10-02/db07_storage_policies.rollback.sql` — drops only the
  `db07_stg_*` set (live pre-state untouched by the forward file, so prefix-scoped drops restore it exactly).
- `docs/storage-audit-2026-10-02.md` — this report.

## 7. Caveats

- The Flutter app shares this Supabase project but is not locally available: its path conventions
  were verified indirectly (repo docs claiming mobile-matching conventions "verified against live
  storage.objects rows" in `src/lib/chat-media.ts`, plus live path shapes observed via service-role
  listing). The db07 runbook's pre-flight (STEP 2) and mobile smoke test (STEP 4c) are mandatory
  before and after applying.
- Live policy definitions were never read (no catalog access); every statement about live behavior
  in this report is a probe-observed boundary, not a policy reading.
- Object contents were never downloaded; certificate sensitivity (F1) is inferred from the
  document class, not from inspecting files.
