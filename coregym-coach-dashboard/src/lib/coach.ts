import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

// The live app schema keys subscriptions, plans and payment_intents by
// coaches.id, not by the auth user id. Resolve the coach row once per
// request; fall back to the auth uid when no coach row exists yet.
// cache() deduplicates repeated resolveCoachId calls within the same
// server request (page + helpers share the result); semantics unchanged.
export const resolveCoachId = cache(
  async (supabase: SupabaseClient, userId: string): Promise<string> => {
    const { data } = await supabase.from("coaches").select("id").eq("user_id", userId).maybeSingle();
    return (data as { id: string } | null)?.id ?? userId;
  }
);
