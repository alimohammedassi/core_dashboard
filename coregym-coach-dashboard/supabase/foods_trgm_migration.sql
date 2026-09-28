-- ============================================================================
-- foods_trgm_migration.sql (DB4)
-- Trigram index so `ILIKE '%query%'` food search uses an index instead of a
-- sequential scan. pg_trgm must be enabled — creating the extension needs
-- sufficient privileges; if the SQL Editor role lacks them, ask the project
-- owner to run `create extension if not exists pg_trgm;` once.
-- STOP AND ASK: needs live apply. Safe/additive (IF NOT EXISTS).
-- ============================================================================

create extension if not exists pg_trgm;

create index if not exists idx_foods_name_trgm
  on public.foods using gin (name gin_trgm_ops);

create index if not exists idx_foods_name_ar_trgm
  on public.foods using gin (name_ar gin_trgm_ops);
