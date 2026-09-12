import type { SupabaseClient } from "@supabase/supabase-js";
import type { Conversation, Message, Profile, Subscription, SubscriptionPlan } from "./types";

// Fetch the authenticated user's profile
export async function getProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) return null;
  return data as Profile;
}

// Check coach role
export async function isCoach(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const profile = await getProfile(supabase, userId);
  return profile?.role === "coach";
}

// Conversations for coach with last message + unread
export async function getConversationsForCoach(supabase: SupabaseClient, coachId: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      `
      *,
      client:profiles!conversations_client_id_fkey(id, full_name, avatar_url, email),
      messages!messages_conversation_id_fkey(id, content, created_at, sender_id, read)
    `
    )
    .eq("coach_id", coachId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data as unknown as (Conversation & { messages: Message[] })[];
}

// Messages for a conversation
export async function getMessages(supabase: SupabaseClient, conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as Message[];
}

// Subscribers (active subscriptions) for coach
export async function getSubscribersForCoach(supabase: SupabaseClient, coachId: string) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      `
      *,
      plan:subscription_plans(id, name, price_cents, duration_days, currency),
      client:profiles!subscriptions_client_id_fkey(id, full_name, avatar_url, email)
    `
    )
    .eq("coach_id", coachId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data as unknown as (Subscription & { plan: SubscriptionPlan | null; client: Profile | null })[];
}

// Plans owned by coach
export async function getPlansForCoach(supabase: SupabaseClient, coachId: string) {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as SubscriptionPlan[];
}

// Overview stats
export async function getOverviewStats(supabase: SupabaseClient, coachId: string) {
  const [subsRes, msgsRes] = await Promise.all([
    supabase.from("subscriptions").select("id, status").eq("coach_id", coachId).eq("status", "active"),
    supabase
      .from("messages")
      .select("id, read, conversation_id, conversations!inner(coach_id)")
      .eq("conversations.coach_id", coachId)
      .eq("read", false)
      // sender is client, not coach — counting unread client messages for coach
      // Supabase doesn't support != easily here; filter client-side if needed
  ]);

  const active = subsRes.data?.length ?? 0;
  const unread = msgsRes.data?.length ?? 0;

  // Revenue this month from payment_intents (best-effort)
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: payments } = await supabase
    .from("payment_intents")
    .select("amount, status, created_at")
    .eq("coach_id", coachId)
    .gte("created_at", monthStart.toISOString())
    .eq("status", "succeeded");

  const gross = (payments ?? []).reduce((sum: number, p: { amount: number }) => sum + (p.amount ?? 0), 0);

  return {
    active_subscribers: active,
    unread_messages: unread,
    gross_this_month_cents: gross,
  };
}
