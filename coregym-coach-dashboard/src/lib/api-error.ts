// S10: Supabase/PostgREST/RPC error internals must never reach clients.
// Log the detail server-side, return a generic user-facing message.
// Our own literal validation/ownership messages stay as-is — only the
// raw `*.message` passthroughs go through here.
export function dbError(context: string, error: unknown): { error: string } {
  // Supabase returns plain PostgREST error objects (code/message/details/hint),
  // not Error instances — String() logged "[object Object]" and hid the real
  // failure. Server console only; the client response is unchanged.
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? JSON.stringify(error)
        : String(error);
  console.error(`[api:${context}]`, detail);
  return { error: "Something went wrong. Please try again." };
}
