-- CoreGym Coach Dashboard — Assumed Supabase schema (Step 1)
-- Project ref: mkrjvrnysuvtokqkyoll
-- NOTE: Real schema could not be introspected. Flutter app at
-- C:\Users\mabou\Desktop\coregym-main uses Firebase Auth (no Supabase client found),
-- and Supabase project requires anon/service_role keys which were not provided.
-- This schema is the canonical proposal inferred from the dashboard prompt.
-- Flag [NEW] = column/table not known to exist in live project; to be added.
-- Flag [ASSUMED] = inferred from prompt's placeholder names; verify against live DB
-- before running migrations.

-- ============================================================
-- Enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('client', 'coach', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'active', 'canceled', 'past_due', 'trialing', 'incomplete', 'paused', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Profiles (maps auth.users -> role)
-- ============================================================
-- [ASSUMED] Could also be named `users` or `coaches`. We use `profiles` with `role`.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  role user_role NOT NULL DEFAULT 'client',
  -- [NEW] Required for Stripe Connect Express payouts per Step 5
  stripe_account_id text,
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Subscription Plans (coach-owned products)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  duration_days integer NOT NULL DEFAULT 30 CHECK (duration_days > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Subscriptions — canonical table written to by payment flow
-- ============================================================
-- Prompt notes ambiguity between `subscriptions` vs `coach_subscriptions`.
-- We standardize on `subscriptions` (alias view `coach_subscriptions` can be added).
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  status subscription_status NOT NULL DEFAULT 'active',
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  stripe_subscription_id text,
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Chat: conversations + messages (shared with Flutter app)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  UNIQUE (coach_id, client_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Reviews (coach ratings)
-- ============================================================
-- Prompt ambiguity: `reviews` vs `coach_reviews`. Canonical = `coach_reviews`
CREATE TABLE IF NOT EXISTS public.coach_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Compatibility view if code expects `reviews`
-- CREATE VIEW public.reviews AS SELECT * FROM public.coach_reviews;

-- ============================================================
-- Payments (Stripe)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  stripe_payment_intent_id text UNIQUE,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL,
  coach_id uuid REFERENCES public.profiles(id),
  client_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_coach ON public.subscription_plans(coach_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_coach ON public.subscriptions(coach_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_client ON public.subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_conversations_coach ON public.conversations(coach_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client ON public.conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_intents_coach ON public.payment_intents(coach_id);

-- ============================================================
-- Realtime
-- ============================================================
-- Enable Realtime for chat tables (idempotent)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Row Level Security (RLS) — Step 2 mandatory policies
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

-- Helper: is_coach()
CREATE OR REPLACE FUNCTION public.is_coach() RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profiles: users can read own row; coaches can read client profiles they have a subscription/conversation with
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (
  id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.coach_id = auth.uid() AND s.client_id = profiles.id)
  OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.coach_id = auth.uid() AND c.client_id = profiles.id)
);
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (id = auth.uid());
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());

-- Subscription plans: coach CRUD own plans; clients can read active plans of their coach
DROP POLICY IF EXISTS "plans_coach_all" ON public.subscription_plans;
CREATE POLICY "plans_coach_all" ON public.subscription_plans FOR ALL USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
DROP POLICY IF EXISTS "plans_read_active" ON public.subscription_plans;
CREATE POLICY "plans_read_active" ON public.subscription_plans FOR SELECT USING (is_active = true);

-- Subscriptions: coach can SELECT/UPDATE own rows; service_role bypasses RLS for webhooks
DROP POLICY IF EXISTS "subscriptions_coach_select" ON public.subscriptions;
CREATE POLICY "subscriptions_coach_select" ON public.subscriptions FOR SELECT USING (coach_id = auth.uid());
DROP POLICY IF EXISTS "subscriptions_coach_update" ON public.subscriptions;
CREATE POLICY "subscriptions_coach_update" ON public.subscriptions FOR UPDATE USING (coach_id = auth.uid());
DROP POLICY IF EXISTS "subscriptions_client_select" ON public.subscriptions;
CREATE POLICY "subscriptions_client_select" ON public.subscriptions FOR SELECT USING (client_id = auth.uid());
-- INSERT is done via service_role or authenticated client creating own subscription
DROP POLICY IF EXISTS "subscriptions_insert_own" ON public.subscriptions;
CREATE POLICY "subscriptions_insert_own" ON public.subscriptions FOR INSERT WITH CHECK (client_id = auth.uid() OR coach_id = auth.uid());

-- Conversations: coach or client participant can read
DROP POLICY IF EXISTS "conversations_participant_select" ON public.conversations;
CREATE POLICY "conversations_participant_select" ON public.conversations FOR SELECT USING (
  coach_id = auth.uid() OR client_id = auth.uid()
);
DROP POLICY IF EXISTS "conversations_participant_insert" ON public.conversations;
CREATE POLICY "conversations_participant_insert" ON public.conversations FOR INSERT WITH CHECK (
  coach_id = auth.uid() OR client_id = auth.uid()
);

-- Messages: only participants of conversation can SELECT/INSERT
DROP POLICY IF EXISTS "messages_participant_select" ON public.messages;
CREATE POLICY "messages_participant_select" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.coach_id = auth.uid() OR c.client_id = auth.uid()))
);
DROP POLICY IF EXISTS "messages_participant_insert" ON public.messages;
CREATE POLICY "messages_participant_insert" ON public.messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.coach_id = auth.uid() OR c.client_id = auth.uid()))
  AND sender_id = auth.uid()
);
-- Allow participants to update read flag
DROP POLICY IF EXISTS "messages_participant_update" ON public.messages;
CREATE POLICY "messages_participant_update" ON public.messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.coach_id = auth.uid() OR c.client_id = auth.uid()))
);

-- Coach reviews: public read for coach's reviews; client can insert for their coach
DROP POLICY IF EXISTS "reviews_select_all" ON public.coach_reviews;
CREATE POLICY "reviews_select_all" ON public.coach_reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "reviews_insert_client" ON public.coach_reviews;
CREATE POLICY "reviews_insert_client" ON public.coach_reviews FOR INSERT WITH CHECK (client_id = auth.uid());

-- Payment intents: coach can read own
DROP POLICY IF EXISTS "payment_intents_coach_select" ON public.payment_intents;
CREATE POLICY "payment_intents_coach_select" ON public.payment_intents FOR SELECT USING (coach_id = auth.uid());

-- ============================================================
-- Updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS trg_plans_updated ON public.subscription_plans;
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS trg_subs_updated ON public.subscriptions;
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS trg_conv_updated ON public.conversations;
CREATE TRIGGER trg_conv_updated BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
