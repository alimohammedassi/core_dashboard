-- ============================================================================
-- API-04 (P2, DB-level guard) — make tenant ownership columns immutable at
-- the database level. The app treats coach_id/client_id/user_id as immutable
-- (writes re-target rows by id only after an ownership pre-read); this turns
-- that assumption into an enforced constraint. Additive; blocks no current
-- code path (none mutates these columns). NOT APPLIED YET.
-- ROLLBACK: api04_tenant_id_immutability.rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_ownership_drift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'Tenant ownership columns are immutable (table %, row %)',
      TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

-- coach_id-only variant: for tables without a client_id column. Defined
-- BEFORE the DO blocks below so the dynamic CREATE TRIGGER statements can
-- reference it.
CREATE OR REPLACE FUNCTION public.prevent_coach_id_drift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id THEN
    RAISE EXCEPTION 'Tenant ownership columns are immutable (table %, row %)',
      TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Tables whose rows carry BOTH coach_id and client_id
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workout_assignments',
    'client_program_enrollments',
    'nutrition_assignments',
    'client_nutrition_enrollments',
    'conversations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_ownership ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_ownership BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.prevent_ownership_drift()', t, t);
  END LOOP;
END $$;

-- Tables whose rows carry coach_id only (client_id column may not exist)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workout_templates',
    'coach_programs',
    'nutrition_programs',
    'payment_intents'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'client_id'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_ownership ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_%s_ownership BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.prevent_ownership_drift()', t, t);
    ELSE
      -- coach_id-only table: use a dedicated single-column trigger
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_ownership_coach ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_%s_ownership_coach BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.prevent_coach_id_drift()', t, t);
    END IF;
  END LOOP;
END $$;

-- Verify: attempt to move a row's coach_id in a transaction and ROLLBACK:
--   begin; update workout_assignments set coach_id = coach_id where id =
--   (select id from workout_assignments limit 1);  -- should ERROR
--   rollback;
-- Run after confirming every target table exists (missing tables abort the
-- DO blocks — the runbook introspection covers this).
