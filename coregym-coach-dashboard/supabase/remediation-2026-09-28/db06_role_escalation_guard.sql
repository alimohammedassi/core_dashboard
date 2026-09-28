-- ============================================================================
-- DB-06 (NEW, P1) — role-escalation guard on public.profiles.
-- Reconciled against LIVE introspection 2026-09-28 and the current
-- application behavior. NOT APPLIED. NOT COMMITTED — see F. Risk in the
-- run report: applying this requires a product decision + mobile verification.
--
-- LIVE FACTS this reconciles:
--   * RLS on profiles is enabled; live UPDATE policy is own-row
--     (authenticated, id = auth.uid()) with default full-column grants and
--     NO escalation trigger -> any authenticated user can currently run
--     UPDATE profiles SET role='coach' WHERE id = auth.uid() via PostgREST,
--     bypassing the S2 eligibility gate that POST /api/coaches enforces.
--   * The reference implementation (rls_role_updates.sql:26-44) was never
--     applied (function verified ABSENT live). It guarded UPDATE only, had
--     no search_path, and allowed self-demotion. This version reconciles it:
--     covers INSERT + UPDATE, adds SET search_path = public, and blocks ALL
--     non-service role changes (promotion, demotion, tampering) — stricter
--     and simpler to audit.
--
-- Compatibility (verified against current code):
--   * POST /api/coaches (dashboard onboarding) sets role='coach' via the
--     SERVICE role -> auth.role() = 'service_role' -> bypasses the guard. ✓
--   * auth/callback heal branch only READS role. ✓
--   * New-user profile creation (handle_new_user / column default 'client')
--     inserts role='client' -> INSERT guard passes. ✓
--   * Dashboard/mobile profile data updates that leave role unchanged pass. ✓
--
-- KNOWN BREAKING BEHAVIOR (requires product decision — see run report §F):
--   The mobile signup flow (rollback/originals snapshot, login_sign_up.dart
--   ~line 508) upserts a USER-CHOSEN role into profiles after signup. With
--   this guard, an UPDATE that sets role='coach' from the mobile session is
--   rejected: mobile coach signups must instead go through the dashboard's
--   onboarding API (POST /api/coaches) or a purpose-built eligibility-checked
--   RPC. Client-role mobile signups are unaffected. An S2-conditional variant
--   (allow client->coach unless the account has active client subscriptions)
--   is included below, COMMENTED OUT, if product prefers that trade-off.
--
-- Idempotent. ROLLBACK: db06_role_escalation_guard.rollback.sql (restores the
-- current no-guard state, i.e. self-promotion becomes possible again).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Legitimate server-side/admin transitions (dashboard onboarding API,
  -- service-role maintenance) bypass the guard entirely.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- New profiles are created as 'client' (column default / auth trigger).
    IF NEW.role = 'coach' THEN
      RAISE EXCEPTION 'Becoming a coach requires the Core Dashboard onboarding flow';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: no self-service role changes at all — promotion, demotion, or
  -- tampering with another coach's role flag on their own row.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Profile role is system-managed; coach onboarding must use the Core Dashboard flow';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- ── ALTERNATIVE (product decision pending) — S2-conditional variant ────────
-- Allows client->coach self-promotion UNLESS the account has an active client
-- subscription (enforces the S2 rule at the DB level instead of blocking all
-- self-promotion). Use ONLY if product decides mobile role-pick signup must
-- keep working unchanged. Replace the UPDATE branch above with:
--
--   IF NEW.role = 'coach' AND OLD.role <> 'coach'
--      AND auth.role() <> 'service_role'
--      AND EXISTS (
--        SELECT 1 FROM public.subscriptions s
--        WHERE s.client_id = NEW.id AND s.status = 'active'
--      ) THEN
--     RAISE EXCEPTION 'Active clients cannot convert to coach';
--   END IF;
--   RETURN NEW;

-- ============================================================================
-- RUNBOOK:
--   1. Save pre-state: pg_proc/pg_trigger for prevent_role_escalation
--      (verified ABSENT live) + confirm no other triggers on profiles.
--   2. PRODUCT DECISION REQUIRED before applying (see KNOWN BREAKING
--      BEHAVIOR above). Confirm the mobile app's current signup flow.
--   3. Apply.
--   4. Verify: as an authenticated test user,
--        PATCH /rest/v1/profiles?id=eq.<own-id> {"role":"coach"}  -> error
--        PATCH /rest/v1/profiles?id=eq.<own-id> {"name":"x"}      -> 200
--      Coach onboarding via the dashboard still completes (service role).
--   5. MOBILE smoke test: client signup; coach signup (EXPECTED to need the
--      mobile-side change documented above).
-- ============================================================================
