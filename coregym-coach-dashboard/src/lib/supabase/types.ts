// Types matching the LIVE Supabase project schema (introspected via PostgREST).
// The live schema is the mobile app's real backend and differs from supabase/schema.sql.

export type UserRole = "client" | "coach" | "admin";
export type SubscriptionStatus =
  | "active"
  | "cancelled"
  | "canceled"
  | "past_due"
  | "trialing"
  | "incomplete"
  | "paused"
  | "expired";

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  full_name: string | null;
  gender: string | null;
  age: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  fitness_goal: string | null;
  avatar_url: string | null;
  role: UserRole;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  coach_id: string; // references coaches.id
  name: string;
  price_usd: number;
  duration_days: number;
  max_clients: number | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  client_id: string;
  coach_id: string; // references coaches.id
  plan_id: string | null;
  status: SubscriptionStatus;
  tier: string | null;
  start_date: string;
  end_date: string | null;
  payment_status: string | null;
  stripe_sub_id: string | null;
  stripe_customer_id: string | null;
  goals: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  plan?: SubscriptionPlan | null;
  client?: Profile | null;
}

export interface Conversation {
  id: string;
  client_id: string;
  coach_id: string;
  subscription_id: string | null;
  last_message_at: string | null;
  client_unread: number | null;
  coach_unread: number | null;
  is_active: boolean | null;
  created_at: string;
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
  type: string | null;
  file_url: string | null;
  is_read: boolean | null;
  is_deleted: boolean | null;
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
  client_id: string | null;
  coach_id: string | null;
  stripe_payment_id: string | null;
  stripe_customer_id: string | null;
  amount: number;
  currency: string | null;
  status: string | null;
  tier: string | null;
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
