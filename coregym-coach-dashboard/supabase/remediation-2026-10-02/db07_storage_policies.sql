-- ============================================================================
-- DB-07 (HIGH) — storage.objects least-privilege policy codification
-- Remediation 2026-10-02 · storage security audit (docs/storage-audit-2026-10-02.md)
--
-- STATUS: NOT EXECUTED. This environment has NO live DDL access (Supabase
-- Management API 401, no Postgres connection string — see
-- docs/remediation-baseline-2026-10-02.md). Apply manually per the runbook
-- below, in the Supabase SQL editor (or any SQL session as a role that owns
-- the storage schema).
--
-- ── PROBLEM ──────────────────────────────────────────────────────────────────
-- Zero storage.objects policies exist in ANY repo migration, yet the live
-- project enforces object-level RLS (anon list on private buckets → [], anon +
-- authenticated-foreign reads → 400, cross-tenant writes → 400; verified by
-- scripts/probes-2026-10-02/probe-storage.mjs on 2026-10-02). The live policy
-- set — whoever created it — is invisible to version control: it cannot be
-- reviewed, diffed, restored, or reasoned about. One dashboard edit can widen
-- it silently. Additionally, live chat-bucket behavior suggests SELECT is
-- owner-scoped rather than conversation-participant-scoped: the QA coach
-- (participant of 10 conversations) sees ZERO top-level entries in the chat
-- buckets, so counterpart media is only reachable through service-role signed
-- URLs today. product-workflow.md documents the INTENDED design: "storage
-- policies scope path segment 1 to conversation participants".
--
-- ── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
-- Creates an explicit, reviewable, prefix-named (db07_stg_*) least-privilege
-- policy set on storage.objects. It drops NOTHING: effective access becomes
-- union(live policies, db07 policies). Every db07 grant is bounded by:
--   * public buckets (avatars, coach-media, coach-pdfs, food-images):
--       SELECT to public (preserves intentionally-public marketplace/avatar
--       reads and /object/public/ semantics);
--       INSERT/UPDATE/DELETE to authenticated, only where path segment 1 =
--       auth.uid() (each user is confined to their own {uid}/ folder — the
--       convention every writer in this repo uses: SettingsSections.tsx
--       "{userId}/avatar.{ext}", CredentialsManager.tsx "{uid}/{millis}_{name}");
--       food-images gets NO write policy at all (static seeded catalog,
--       "foods/" prefix — writes are service-role only).
--   * private chat buckets (chat-images, chat-voice-notes, chat-files):
--       all operations scoped to CONVERSATION PARTICIPANTS via path segment 1
--       = conversations.id and a coach_id/client_id membership check — the
--       exact predicate the app itself enforces in
--       src/app/api/chat/upload/route.ts and chat/attachments/route.ts.
--   * private user buckets (food-scans, voice-food-logs):
--       all operations owner-scoped via path segment 1 = auth.uid()
--       (live paths verified to be {uid}/... ; mobile-app-written).
--
-- KNOWN COMPATIBILITY EFFECT (intended, bounded): if the live chat SELECT is
-- owner-only, db07 WIDENS chat-bucket SELECT to conversation participants —
-- the app's own data model and the documented intended design. It grants
-- nothing to anyone outside a conversation's two participants. If the live
-- pre-state (runbook step 1) already shows a participant-scoped policy, db07
-- changes nothing for reads.
--
-- KNOWN LIMIT (cannot be fixed in SQL alone — see audit finding F1):
-- coach certificates/achievements are uploaded by the dashboard into the
-- PUBLIC coach-media bucket and stored as public URLs in coach_content
-- (is_public = true). db07 keeps coach-media public-read so the marketplace
-- keeps working; moving credentials to a PRIVATE bucket requires an app-side
-- change + object migration (design documented in the audit report). Until
-- then certificates remain world-readable-by-URL BY DESIGN of the app code.
--
-- ── RUNBOOK (introspect → apply → verify). Execute IN ORDER, STOP on error ──
-- STEP 1 — INTROSPECT AND SAVE THE LIVE PRE-STATE (mandatory, paste output
--          into remediation-log.md):
--   select schemaname, tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies where schemaname = 'storage' order by tablename, policyname;
--   select table_name, privilege_type from information_schema.role_table_grants
--   where table_schema = 'storage' and grantee in ('anon','authenticated')
--   order by table_name, privilege_type;
--   REVIEW: db07 creates its own set and drops nothing. If step 1 reveals a
--   live policy MORE permissive than db07 on a sensitive operation (e.g.
--   INSERT/UPDATE/DELETE on storage.objects TO public or TO authenticated
--   without a path/owner bound), DROP THAT POLICY BY NAME in the same session
--   and record the exact name + definition in remediation-log.md. Do not skip.
--
-- STEP 2 — PRE-FLIGHT PATH-CONVENTION CHECK (paste output into
--          remediation-log.md). db07 assumes path segment 1 is: a user id for
--          avatars/coach-media/coach-pdfs/food-scans/voice-food-logs, a
--          conversations.id for chat-images/chat-voice-notes/chat-files.
--          If any bucket shows prefixes that violate its expectation, STOP —
--          do not apply this file until the exceptions are resolved:
--   select bucket_id, count(distinct (storage.foldername(name))[1]) as owners,
--          min(created_at)::date as oldest
--   from storage.objects group by bucket_id order by bucket_id;
--   -- spot-check that chat bucket segment-1 values are conversation ids:
--   select o.bucket_id,
--          count(*) filter (where exists (select 1 from public.conversations c
--                                where c.id::text = (storage.foldername(o.name))[1])
--                          ) as conv_scoped,
--          count(*) as total
--   from storage.objects o
--   where o.bucket_id in ('chat-images','chat-voice-notes','chat-files')
--   group by o.bucket_id;
--   (conv_scoped = total for all three chat buckets, or document the gap.)
--
-- STEP 3 — APPLY this file in the Supabase SQL editor (single transaction).
--
-- STEP 4 — VERIFY (behavior must be IDENTICAL to the 2026-10-02 pre-state
--          probes, except chat buckets may now list/read for participants):
--   a) re-run: node scripts/probes-2026-10-02/probe-storage.mjs
--      expect: anon list private buckets → 0 entries; anon + foreign-auth
--      reads on private buckets → non-200; anon + foreign-auth writes → 400;
--      public buckets → list/read 200 (by design).
--   b) dashboard smoke: avatar upload + replace (avatars, own folder);
--      credentials upload (coach-media, own folder); chat image/voice/file
--      send and render (service-signed URLs — unchanged).
--   c) MOBILE smoke (mandatory — the Flutter app shares this Supabase):
--      chat media send + display in both directions of one conversation;
--      food scan / voice-food-log upload + display (owner paths).
-- STEP 5 — record outcome + step 1/2 outputs in docs/remediation-log.md.
--
-- Rollback: db07_storage_policies.rollback.sql — drops ONLY the db07_stg_*
-- policies created here (never touches the unknown live set), restoring the
-- exact pre-state because the forward file modifies nothing else: no grants,
-- no RLS enable/disable, no bucket changes.
-- ============================================================================

-- ── 0) RLS on storage.objects (Supabase default: enabled). Idempotent no-op.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ── 1) PUBLIC buckets — public read, owner-scoped writes ────────────────────
-- avatars: profile photos, path "{uid}/avatar.{ext}", public URL persisted in
-- profiles.avatar_url and rendered across dashboard + marketplace.
DROP POLICY IF EXISTS "db07_stg_avatars_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_avatars_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_avatars_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_avatars_delete"  ON storage.objects;
CREATE POLICY "db07_stg_avatars_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');
CREATE POLICY "db07_stg_avatars_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "db07_stg_avatars_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "db07_stg_avatars_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- coach-media: marketplace media AND (until finding F1 is remediated) coach
-- achievements/certificates, path "{uid}/{millis}_{name}". Public read is
-- required by the marketplace and by the public URLs stored in coach_content.
DROP POLICY IF EXISTS "db07_stg_coach_media_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_coach_media_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_coach_media_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_coach_media_delete"  ON storage.objects;
CREATE POLICY "db07_stg_coach_media_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'coach-media');
CREATE POLICY "db07_stg_coach_media_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'coach-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "db07_stg_coach_media_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'coach-media' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'coach-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "db07_stg_coach_media_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'coach-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- coach-pdfs: marketplace PDF content (empty live today), same model.
DROP POLICY IF EXISTS "db07_stg_coach_pdfs_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_coach_pdfs_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_coach_pdfs_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_coach_pdfs_delete"  ON storage.objects;
CREATE POLICY "db07_stg_coach_pdfs_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'coach-pdfs');
CREATE POLICY "db07_stg_coach_pdfs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'coach-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "db07_stg_coach_pdfs_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'coach-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'coach-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "db07_stg_coach_pdfs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'coach-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- food-images: static seeded food catalog ("foods/" prefix), rendered on
-- marketplace/diet screens. Read-only public — NO write policy: catalog
-- uploads are service-role only (service_role bypasses RLS).
DROP POLICY IF EXISTS "db07_stg_food_images_select" ON storage.objects;
CREATE POLICY "db07_stg_food_images_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'food-images');

-- ── 2) PRIVATE chat buckets — conversation-participant scoped ───────────────
-- Path segment 1 = conversations.id (dashboard route + mobile convention are
-- identical). The membership predicate mirrors the app's own participant
-- check exactly (coach_id.eq.uid OR client_id.eq.uid).
DROP POLICY IF EXISTS "db07_stg_chat_images_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_images_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_images_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_images_delete"  ON storage.objects;
CREATE POLICY "db07_stg_chat_images_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  );
CREATE POLICY "db07_stg_chat_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  );
CREATE POLICY "db07_stg_chat_images_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  );
CREATE POLICY "db07_stg_chat_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "db07_stg_chat_voice_notes_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_voice_notes_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_voice_notes_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_voice_notes_delete"  ON storage.objects;
CREATE POLICY "db07_stg_chat_voice_notes_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-voice-notes'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  );
CREATE POLICY "db07_stg_chat_voice_notes_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-voice-notes'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  );
CREATE POLICY "db07_stg_chat_voice_notes_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-voice-notes'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'chat-voice-notes'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  );
CREATE POLICY "db07_stg_chat_voice_notes_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-voice-notes'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "db07_stg_chat_files_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_files_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_files_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_files_delete"  ON storage.objects;
CREATE POLICY "db07_stg_chat_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  );
CREATE POLICY "db07_stg_chat_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-files'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  );
CREATE POLICY "db07_stg_chat_files_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'chat-files'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  );
CREATE POLICY "db07_stg_chat_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.coach_id = auth.uid() OR c.client_id = auth.uid())
    )
  );

-- ── 3) PRIVATE user buckets — owner-scoped (mobile-app-written) ─────────────
-- food-scans (meal photos) and voice-food-logs (voice transcriptions source):
-- personal nutrition data; live paths verified as "{uid}/...". Only the owner
-- touches these objects; the dashboard never reads them (no repo reference).
DROP POLICY IF EXISTS "db07_stg_food_scans_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_food_scans_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_food_scans_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_food_scans_delete"  ON storage.objects;
CREATE POLICY "db07_stg_food_scans_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'food-scans' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "db07_stg_food_scans_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'food-scans' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "db07_stg_food_scans_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'food-scans' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'food-scans' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "db07_stg_food_scans_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'food-scans' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "db07_stg_voice_food_logs_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_voice_food_logs_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_voice_food_logs_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_voice_food_logs_delete"  ON storage.objects;
CREATE POLICY "db07_stg_voice_food_logs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'voice-food-logs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "db07_stg_voice_food_logs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voice-food-logs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "db07_stg_voice_food_logs_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'voice-food-logs' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'voice-food-logs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "db07_stg_voice_food_logs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'voice-food-logs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- END DB-07. NOT EXECUTED. 33 policies created above, all named db07_stg_*.
-- After applying, run STEP 4 verification and log results. Rollback file:
-- supabase/remediation-2026-10-02/db07_storage_policies.rollback.sql
-- ============================================================================
