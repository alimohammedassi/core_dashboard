-- ============================================================================
-- API-04 ROLLBACK — removes the ownership-immutability triggers and helper
-- functions, restoring the pre-migration state (app-level checks only).
-- ============================================================================

DROP TRIGGER IF EXISTS trg_workout_assignments_ownership          ON public.workout_assignments;
DROP TRIGGER IF EXISTS trg_client_program_enrollments_ownership   ON public.client_program_enrollments;
DROP TRIGGER IF EXISTS trg_nutrition_assignments_ownership        ON public.nutrition_assignments;
DROP TRIGGER IF EXISTS trg_client_nutrition_enrollments_ownership ON public.client_nutrition_enrollments;
DROP TRIGGER IF EXISTS trg_conversations_ownership                ON public.conversations;

DROP TRIGGER IF EXISTS trg_workout_templates_ownership       ON public.workout_templates;
DROP TRIGGER IF EXISTS trg_workout_templates_ownership_coach ON public.workout_templates;
DROP TRIGGER IF EXISTS trg_coach_programs_ownership          ON public.coach_programs;
DROP TRIGGER IF EXISTS trg_coach_programs_ownership_coach    ON public.coach_programs;
DROP TRIGGER IF EXISTS trg_nutrition_programs_ownership      ON public.nutrition_programs;
DROP TRIGGER IF EXISTS trg_nutrition_programs_ownership_coach ON public.nutrition_programs;
DROP TRIGGER IF EXISTS trg_payment_intents_ownership         ON public.payment_intents;
DROP TRIGGER IF EXISTS trg_payment_intents_ownership_coach   ON public.payment_intents;

DROP FUNCTION IF EXISTS public.prevent_ownership_drift();
DROP FUNCTION IF EXISTS public.prevent_coach_id_drift();
