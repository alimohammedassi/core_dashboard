-- ============================================================================
-- DB-07 ROLLBACK — storage.objects least-privilege policy codification
-- Remediation 2026-10-02 · companion to db07_storage_policies.sql (NOT EXECUTED)
--
-- PURPOSE: restore the exact live pre-state. The forward file creates ONLY
-- policies named with the distinguishable prefix `db07_stg_` and touches
-- nothing else (no grants, no RLS enable/disable, no bucket changes, no drops
-- of the pre-existing live policy set — whose exact definitions are UNKNOWN by
-- design of this remediation). Restoring the pre-state therefore means
-- dropping exactly the db07_stg_* set and nothing more.
--
-- RUNBOOK:
--   1. Apply ONLY if rolling back a previously applied db07 forward file.
--   2. Execute in the Supabase SQL editor (single transaction).
--   3. Verify: re-run scripts/probes-2026-10-02/probe-storage.mjs — results
--      must match the 2026-10-02 pre-state probe log (docs/storage-audit-
--      2026-10-02.md): private buckets deny anon + foreign-authenticated
--      list/read/write; public buckets list/read 200; foreign writes denied.
--   4. Confirm no db07_stg_* policies remain:
--        select policyname from pg_policies
--        where schemaname = 'storage' and policyname like 'db07_stg_%';
--      (expect zero rows)
--   5. Record the rollback in docs/remediation-log.md.
-- ============================================================================

-- avatars
DROP POLICY IF EXISTS "db07_stg_avatars_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_avatars_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_avatars_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_avatars_delete"  ON storage.objects;

-- coach-media
DROP POLICY IF EXISTS "db07_stg_coach_media_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_coach_media_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_coach_media_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_coach_media_delete"  ON storage.objects;

-- coach-pdfs
DROP POLICY IF EXISTS "db07_stg_coach_pdfs_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_coach_pdfs_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_coach_pdfs_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_coach_pdfs_delete"  ON storage.objects;

-- food-images (SELECT only — forward file grants no writes here)
DROP POLICY IF EXISTS "db07_stg_food_images_select" ON storage.objects;

-- chat-images
DROP POLICY IF EXISTS "db07_stg_chat_images_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_images_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_images_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_images_delete"  ON storage.objects;

-- chat-voice-notes
DROP POLICY IF EXISTS "db07_stg_chat_voice_notes_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_voice_notes_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_voice_notes_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_voice_notes_delete"  ON storage.objects;

-- chat-files
DROP POLICY IF EXISTS "db07_stg_chat_files_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_files_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_files_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_chat_files_delete"  ON storage.objects;

-- food-scans
DROP POLICY IF EXISTS "db07_stg_food_scans_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_food_scans_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_food_scans_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_food_scans_delete"  ON storage.objects;

-- voice-food-logs
DROP POLICY IF EXISTS "db07_stg_voice_food_logs_select"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_voice_food_logs_insert"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_voice_food_logs_update"  ON storage.objects;
DROP POLICY IF EXISTS "db07_stg_voice_food_logs_delete"  ON storage.objects;

-- ============================================================================
-- END ROLLBACK. 33 DROP statements, prefix-scoped to db07_stg_*. The live
-- pre-state policy set (introspected per the forward runbook STEP 1) is
-- intentionally untouched, so the pre-remediation behavior is fully restored.
-- ============================================================================
