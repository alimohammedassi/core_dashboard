-- ============================================================================
-- coach_content_type_migration.sql
-- Widens the coach_content.type CHECK so the Settings Achievements /
-- Certificates sections can persist.
--
-- Root cause: the live `coach_content_type_check` only permits
-- ('image', 'video', 'pdf'), while the dashboard's CredentialsManager sends
-- the section key as `type` ('achievement' | 'certificate'). Every upload in
-- Settings → Professional profile → Achievements / Certificates therefore
-- fails with a 400 check-constraint violation. Verified live 2026-09-23:
-- all 16 probed type values except image/video/pdf are rejected, including
-- both values the UI sends.
--
-- This migration only widens the allowed set (existing rows unaffected —
-- the table is empty in production as of 2026-09-23). No RLS, index, or
-- trigger changes. Idempotent: safe to run multiple times.
-- NOT APPLIED YET — run in the Supabase SQL Editor after owner approval.
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coach_content_type_check'
  ) THEN
    ALTER TABLE public.coach_content DROP CONSTRAINT coach_content_type_check;
  END IF;
END $$;

ALTER TABLE public.coach_content
  ADD CONSTRAINT coach_content_type_check
  CHECK (type IN ('image', 'video', 'pdf', 'achievement', 'certificate'));
