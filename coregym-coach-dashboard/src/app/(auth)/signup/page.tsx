"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const SPECIALIZATIONS = [
  "Weight Loss",
  "Muscle Gain",
  "CrossFit",
  "Boxing",
  "Nutrition",
  "Yoga",
  "Running",
  "Calisthenics",
];

// Coach sign-up for the Core Dashboard website. Customers sign up inside the
// CoreGym mobile app — this page is for coaches only. Onboarding writes the
// coach's rows to the shared database (via /api/coaches) so they appear in the
// app's "Find a Coach" screen immediately.
export default function SignupPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [priceMonthly, setPriceMonthly] = React.useState("300");
  const [yearsExperience, setYearsExperience] = React.useState("");
  const [specializations, setSpecializations] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);

  function toggleSpec(s: string) {
    setSpecializations((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName || !email || !password) {
      toast.error("Please fill name, email and password");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: displayName, role: "coach" } },
      });
      if (error) throw error;
      if (!data.user) throw new Error("No user returned");
      if (!data.session) {
        toast.info("Account created — please confirm your email, then sign in.");
        router.push("/login");
        return;
      }

      const res = await fetch("/api/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          bio,
          price_monthly: Number(priceMonthly) || 0,
          specialization: specializations,
          years_experience: yearsExperience ? Number(yearsExperience) : undefined,
        }),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved?.error ?? "Coach onboarding failed");

      toast.success("Welcome to CoreGym! Your coach profile is live.");
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignup() {
    if (!displayName.trim()) {
      toast.error("Please enter a display name first");
      return;
    }
    setGoogleLoading(true);
    try {
      const pending = {
        display_name: displayName.trim(),
        bio: bio.trim(),
        price_monthly: Number(priceMonthly) || 0,
        specialization: specializations,
        years_experience: yearsExperience ? Number(yearsExperience) : undefined,
      };
      // Store pending onboarding in a cookie readable by /auth/callback (server)
      const val = encodeURIComponent(JSON.stringify(pending));
      document.cookie = `pending_coach=${val}; path=/; max-age=600; SameSite=Lax`;

      const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Google sign-up failed");
      setGoogleLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Join CoreGym as a Coach</CardTitle>
          <CardDescription>
            Create your coach account. Your profile becomes visible in the app&apos;s Find a Coach screen immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                placeholder="Coach Ali"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Specializations</Label>
              <div className="flex flex-wrap gap-2">
                {SPECIALIZATIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSpec(s)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      specializations.includes(s)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="price">Monthly price (USD)</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  min="0"
                  step="1"
                  value={priceMonthly}
                  onChange={(e) => setPriceMonthly(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="years">Years of experience</Label>
                <Input
                  id="years"
                  type="number"
                  min="0"
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(e.target.value)}
                  placeholder="e.g. 2"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Short bio</Label>
              <Textarea
                id="bio"
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell clients about your coaching style…"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || googleLoading}>
              {loading ? "Creating account…" : "Create coach account"}
            </Button>

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignup}
              disabled={loading || googleLoading}
            >
              {googleLoading ? (
                "Redirecting to Google..."
              ) : (
                <span className="inline-flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Sign up with Google
                </span>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              For Google sign-up, fill display name + details above, then click Google.
            </p>

            <p className="text-center text-sm text-muted-foreground">
              Already a coach?{" "}
              <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
