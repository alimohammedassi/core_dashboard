"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { describeError } from "@/lib/user-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Password recovery step 1 — request a verification code.
// Mirrors the mobile app's ForgotPasswordScreen: Supabase emails an 8-digit
// OTP (the shared "Reset password" template prints {{ .Token }}), the user
// completes the flow on /reset-password. No email link, no deep link, so no
// redirectTo is passed and /auth/callback stays OAuth-only.
export default function ForgotPasswordPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Please enter your email");
      return;
    }
    setLoading(true);
    try {
      // No account-existence lookup and no provider detection here — the
      // generic response prevents user enumeration.
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
      if (error) throw error;
      toast.success("If an account exists for this email, a verification code has been sent.");
      router.push(`/reset-password?email=${encodeURIComponent(trimmed)}`);
    } catch (err: unknown) {
      toast.error(describeError(err, "Could not send the reset email. Please try again."));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Forgot password?</CardTitle>
          <CardDescription>
            Enter your account email and we&apos;ll send you a verification code to set a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send verification code"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                Back to login
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
