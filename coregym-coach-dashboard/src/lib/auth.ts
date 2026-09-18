import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Request-scoped authenticated user. cache() memoizes per server
// request/render: the dashboard layout and the active page share ONE
// getUser round trip instead of two. cache() is cleared between requests,
// so authentication data never crosses requests or users.
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
