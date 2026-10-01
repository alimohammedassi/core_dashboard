import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { getI18n } from "@/lib/i18n/server";
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
  const { t } = await getI18n();
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
  // Provider-aware password controls: a linked "email" identity means the
  // account has (or had) an email/password credential. Server-truthful
  // identities data only — never the email domain, never user_metadata.
  const hasEmailIdentity = user.identities?.some((identity) => identity.provider === "email") ?? true;

  const payouts = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("settings.payouts.cardTitle")}</CardTitle>
        <CardDescription>
          {t("settings.payouts.cardDescA")}{" "}
          <code className="font-mono">stripe_account_id</code>{" "}
          {t("settings.payouts.cardDescB")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm">{t("settings.payouts.statusLabel")}</span>
          {stripeAccountId ? (
            <Badge>{t("settings.payouts.connected", { id: stripeAccountId.slice(0, 12) })}</Badge>
          ) : (
            <Badge variant="secondary">{t("settings.payouts.notConnected")}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("settings.payouts.flowA")}{" "}
          <code className="font-mono">application_fee_amount</code>{" "}
          {t("settings.payouts.flowB")}{" "}
          <code className="font-mono">transfer_data.destination = stripe_account_id</code>.{" "}
          {t("settings.payouts.flowC")}{" "}
          <code className="font-mono">/api/webhooks/stripe</code>{" "}
          {t("settings.payouts.flowD")} <code>payment_intent.succeeded</code>,{" "}
          <code>account.updated</code> {t("settings.payouts.flowE")}
        </p>
        <SettingsClient stripeAccountId={stripeAccountId} />
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-headline-lg tracking-tight">{t("settings.page.title")}</h1>
        <p className="mt-1 text-body-md text-muted-foreground">{t("settings.page.subtitle")}</p>
      </div>

      <SettingsShell
        sections={{
          account: (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("settings.account.photoTitle")}</CardTitle>
                  <CardDescription>{t("settings.account.photoDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <AvatarUpload initialUrl={avatarUrl} userId={user.id} />
                  <AccountNameForm initialName={displayName} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("settings.account.emailTitle")}</CardTitle>
                  <CardDescription>{t("settings.account.emailDesc")}</CardDescription>
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
                  <CardTitle className="text-base">{t("settings.professional.title")}</CardTitle>
                  <CardDescription>
                    {t("settings.professional.desc")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CoachProfileForm />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("settings.professional.achievements.title")}</CardTitle>
                  <CardDescription>
                    {t("settings.professional.achievements.desc")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CredentialsManager
                    coachId={coachId}
                    userId={user.id}
                    type="achievement"
                    accept="image/jpeg,image/png,image/webp"
                    emptyText={t("settings.professional.achievements.empty")}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("settings.professional.certificates.title")}</CardTitle>
                  <CardDescription>{t("settings.professional.certificates.desc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <CredentialsManager
                    coachId={coachId}
                    userId={user.id}
                    type="certificate"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    emptyText={t("settings.professional.certificates.empty")}
                  />
                </CardContent>
              </Card>
            </>
          ),
          notifications: (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("settings.notifications.title")}</CardTitle>
                <CardDescription>{t("settings.notifications.desc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <NotificationsPrefs />
              </CardContent>
            </Card>
          ),
          appearance: (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("settings.appearance.title")}</CardTitle>
                <CardDescription>{t("settings.appearance.desc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <AppearancePrefs />
              </CardContent>
            </Card>
          ),
          security: (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("settings.security.title")}</CardTitle>
                <CardDescription>{t("settings.security.desc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <SecurityControls hasEmailIdentity={hasEmailIdentity} />
              </CardContent>
            </Card>
          ),
          payouts,
        }}
      />
    </div>
  );
}
