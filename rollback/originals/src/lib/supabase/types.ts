// Canonical types matching supabase/schema.sql (assumed schema)
// If live Supabase schema introspection later reveals different names,
// update this file and run `supabase gen types` to regenerate.

export type UserRole = "client" | "coach" | "admin";
export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing"
  | "incomplete"
  | "paused"
  | "expired";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  duration_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  client_id: string;
  coach_id: string;
  plan_id: string | null;
  status: SubscriptionStatus;
  start_date: string;
  end_date: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  plan?: SubscriptionPlan | null;
  client?: Profile | null;
}

export interface Conversation {
  id: string;
  coach_id: string;
  client_id: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  // joined
  client?: Profile | null;
  coach?: Profile | null;
  last_message?: Message | null;
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read: boolean;
  created_at: string;
  sender?: Profile | null;
}

export interface CoachReview {
  id: string;
  coach_id: string;
  client_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface PaymentIntent {
  id: string;
  subscription_id: string | null;
  stripe_payment_intent_id: string | null;
  amount: number;
  currency: string;
  status: string;
  coach_id: string | null;
  client_id: string | null;
  created_at: string;
}

// Dashboard aggregates
export interface RevenueSummary {
  gross_cents: number;
  commission_cents: number;
  net_cents: number;
  payout_count: number;
}

export interface OverviewStats {
  active_subscribers: number;
  net_revenue_this_month_cents: number;
  unread_messages: number;
}

export interface ActivityItem {
  id: string;
  type: "new_subscription" | "canceled" | "new_message" | "payout";
  title: string;
  description: string | null;
  created_at: string;
}
