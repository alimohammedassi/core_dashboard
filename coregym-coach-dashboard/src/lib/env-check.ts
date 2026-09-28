// D2: runtime presence check for required public env vars.
// Warns (never throws) so CI placeholder builds and prerendering keep
// working; in production a missing/placeholder value is a deploy bug and
// gets a loud server-side error instead of a silent misbehaving app.
const REQUIRED_PUBLIC_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

export function checkPublicEnv(): void {
  if (typeof window !== "undefined") return;
  const isProd = process.env.NODE_ENV === "production";
  for (const key of REQUIRED_PUBLIC_ENV) {
    const value = process.env[key] ?? "";
    if (!value || value.includes("placeholder")) {
      const message = `[env-check] ${key} is missing or a placeholder`;
      if (isProd) {
        console.error(`${message} in PRODUCTION — deployment is misconfigured`);
      } else {
        console.warn(`${message} (non-production, continuing)`);
      }
    }
  }
}
