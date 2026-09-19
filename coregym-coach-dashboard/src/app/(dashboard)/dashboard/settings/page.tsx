import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { CoachProfileForm } from "@/components/settings/CoachProfileForm";
import { CredentialsManager } from "@/components/settings/CredentialsManager";
import { NotificationsPrefs } from "@/components/settings/NotificationsPrefs";
import { AvatarUpload, EmailChange, SecurityControls } from "@/components/settings/SettingsSections";
import { AccountNameForm, AppearancePrefs } from "@/components/settings/SettingsExtras";
import { SettingsShell } from "@/components/settings/SettingsShell";

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  // stripe_account_id lives on the coaches row (canonical), not profiles
  const coachId = await resolveCoachId(supabase, user.id);
  const [{ data: coach }, { data: profile }] = await Promise.all([
    supabase.from("coaches").select("stripe_account_id").eq("id", coachId).single(),
    supabase.from("profiles").select("avatar_url, name").eq("id", user.id).single(),
  ]);
  const stripeAccountId = (coach as { stripe_account_id?: string } | null)?.stripe_account_id ?? null;
  const avatarUrl = (profile as { avatar_url?: string } | null)?.avatar_url ?? null;
  const displayName = (profile as { name?: string } | null)?.name ?? "";
  const email = user.email ?? "";

  const payouts = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Stripe Connect (Express)</CardTitle>
        <CardDescription>
          Coach onboarding: creates an Express account and redirects through the Stripe Account Link flow. Stores{" "}
          <code className="font-mono">stripe_account_id</code> on your coach row.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm">Status:</span>
          {stripeAccountId ? (
            <Badge>Connected — {stripeAccountId.slice(0, 12)}…</Badge>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Payment flow (when live): PaymentIntents are created with{" "}
          <code className="font-mono">application_fee_amount</code> (platform commission) and{" "}
          <code className="font-mono">transfer_data.destination = stripe_account_id</code>. The webhook at{" "}
          <code className="font-mono">/api/webhooks/stripe</code> handles <code>payment_intent.succeeded</code>,{" "}
          <code>account.updated</code> and subscription events.
        </p>
        <SettingsClient stripeAccountId={stripeAccountId} />
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Account, professional profile, notifications and security.</p>
      </div>

      <SettingsShell
        sections={{
          account: (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Profile photo & name</CardTitle>
                  <CardDescription>How you appear to clients across the CoreGym apps.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <AvatarUpload initialUrl={avatarUrl} userId={user.id} />
                  <AccountNameForm initialName={displayName} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Email</CardTitle>
                  <CardDescription>The address you sign in with.</CardDescription>
                </CardHeader>
                <CardContent>
                  <EmailChange currentEmail={email} />
                </CardContent>
              </Card>
            </>
          ),
          professional: (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Professional profile</CardTitle>
                  <CardDescription>
                    Your public coaching profile — bio, pricing, specializations, experience and training policy.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CoachProfileForm />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Achievements</CardTitle>
                  <CardDescription>
                    Competition results, milestones and before/after photos. Shown on your public coach profile.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CredentialsManager
                    coachId={coachId}
                    userId={user.id}
                    type="achievement"
                    accept="image/jpeg,image/png,image/webp"
                    emptyText="No achievements uploaded yet — add photos of competitions, milestones or client transformations."
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Certificates</CardTitle>
                  <CardDescription>Certifications and professional qualifications (image or PDF).</CardDescription>
                </CardHeader>
                <CardContent>
                  <CredentialsManager
                    coachId={coachId}
                    userId={user.id}
                    type="certificate"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    emptyText="No certificates uploaded yet — add your certifications and qualifications."
                  />
                </CardContent>
              </Card>
            </>
          ),
          notifications: (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notifications</CardTitle>
                <CardDescription>Reminder and alert preferences for your account.</CardDescription>
              </CardHeader>
              <CardContent>
                <NotificationsPrefs />
              </CardContent>
            </Card>
          ),
          appearance: (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Appearance</CardTitle>
                <CardDescription>Theme and display preferences.</CardDescription>
              </CardHeader>
              <CardContent>
                <AppearancePrefs />
              </CardContent>
            </Card>
          ),
          security: (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Security</CardTitle>
                <CardDescription>Password and session controls.</CardDescription>
              </CardHeader>
              <CardContent>
                <SecurityControls />
              </CardContent>
            </Card>
          ),
          payouts,
        }}
      />
    </div>
  );
}
