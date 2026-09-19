"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [googleAvailable, setGoogleAvailable] = React.useState<boolean | null>(null); // null = probing

  // Surface OAuth redirect errors (cancelled consent, provider failure,
  // non-coach account) that come back through /auth/callback.
  React.useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err === "oauth_cancelled") toast.error("Google sign-in was cancelled.");
    else if (err === "not_coach") toast.error("This account is not a coach account.");
    else if (err) toast.error("Google sign-in failed. Please try again.");
  }, []);

  // Only offer Google sign-in when the provider is enabled in Supabase Auth
  // (public settings endpoint — no secrets involved).
  React.useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`)
      .then((r) => r.json())
      .then((j) => setGoogleAvailable(Boolean(j.external?.google)))
      .catch(() => setGoogleAvailable(false));
  }, []);

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthErr) throw oauthErr;
      // Browser redirects to Google; the callback completes sign-in.
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error("No user returned");

      // Verify coach role
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (profileErr) {
        // If profiles table missing or RLS blocks, allow but warn
        console.warn("Profile fetch failed", profileErr.message);
        toast.warning("Logged in, but profile check failed — verify schema.sql is applied.");
        router.push("/dashboard");
        router.refresh();
        return;
      }

      if (profile?.role !== "coach") {
        await supabase.auth.signOut();
        toast.error("Access denied: this account is not a coach.", {
          description: `Current role: ${profile?.role ?? "unknown"}. Contact admin.`,
        });
        return;
      }

      toast.success("Welcome back!");
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">CoreGym Coach Login</CardTitle>
          <CardDescription>Sign in with your coach account. Non-coach accounts are blocked.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="coach@coregym.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>

            {googleAvailable !== false && (
              <>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-card px-2 text-xs uppercase tracking-wide text-muted-foreground">or</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={googleLoading || loading}
                  onClick={handleGoogle}
                >
                  {googleLoading ? (
                    "Redirecting to Google…"
                  ) : (
                    <>
                      <svg className="mr-2 size-4" viewBox="0 0 24 24" aria-hidden>
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
                        />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </Button>
              </>
            )}

            <p className="text-center text-sm text-muted-foreground">
              <Link href="/" className="underline underline-offset-4 hover:text-foreground">
                Back to home
              </Link>
              {" · "}
              <Link href="/signup" className="underline underline-offset-4 hover:text-foreground">
                New coach? Create account
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
