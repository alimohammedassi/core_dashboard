import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/core/PageHeader";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, BadgeCheck, Bell, Palette, ShieldCheck, CreditCard, Lock } from "lucide-react";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { CoachProfileForm } from "@/components/settings/CoachProfileForm";
import { CredentialsManager } from "@/components/settings/CredentialsManager";
import { NotificationsPrefs } from "@/components/settings/NotificationsPrefs";
import { AvatarUpload, EmailChange, SecurityControls } from "@/components/settings/SettingsSections";
import { AccountNameForm, AppearancePrefs } from "@/components/settings/SettingsExtras";
import { SettingsShell } from "@/components/settings/SettingsShell";

/** Stitch card anatomy: leading volt icon + title, description below, honest
    status badge in the action slot. Shared by every settings card. */
function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="[--card-spacing:--spacing(5)]">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <CardTitle>{title}</CardTitle>
        </div>
        {/* body-sm faint: the custom token loses to the primitive's core
            text-sm without the `!` (Tailwind v4 sort order), and Stitch card
            descriptions sit on the outline (faint) step of the ladder. */}
        <CardDescription className="text-body-sm! text-faint">{description}</CardDescription>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

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

  // Payout status badge — mint + pulse only when actually connected.
  const payoutsBadge = stripeAccountId ? (
    <span className="inline-flex items-center gap-1.5 rounded bg-mint/15 px-2 py-0.5 text-label-sm text-mint">
      <span className="size-1.5 rounded-full bg-mint animate-pulse" aria-hidden="true" />
      {t("settings.payouts.connectedBadge")}
    </span>
  ) : (
    <span className="inline-flex items-center rounded bg-secondary px-2 py-0.5 text-label-sm text-muted-foreground">
      {t("settings.payouts.notConnected")}
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("settings.page.title")}
        chip={t("settings.page.kicker")}
        description={t("settings.page.subtitle")}
        meta={<span>{t("settings.page.coachIdMeta", { id: coachId.slice(-6) })}</span>}
      />

      <SettingsShell
        stripeConnected={Boolean(stripeAccountId)}
        sections={{
          account: (
            <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
              <SectionCard icon={User} title={t("settings.account.photoTitle")} description={t("settings.account.photoDesc")}>
                <div className="space-y-6">
                  <AvatarUpload initialUrl={avatarUrl} userId={user.id} name={displayName} />
                  <AccountNameForm initialName={displayName} />
                </div>
              </SectionCard>
              <SectionCard icon={BadgeCheck} title={t("settings.account.emailTitle")} description={t("settings.account.emailDesc")}>
                <EmailChange currentEmail={email} />
              </SectionCard>
            </div>
          ),
          professional: (
            <div className="flex flex-col gap-5">
              <SectionCard icon={BadgeCheck} title={t("settings.professional.title")} description={t("settings.professional.desc")}>
                <CoachProfileForm />
              </SectionCard>
              <SectionCard
                icon={BadgeCheck}
                title={t("settings.professional.achievements.title")}
                description={t("settings.professional.achievements.desc")}
              >
                <CredentialsManager
                  coachId={coachId}
                  userId={user.id}
                  type="achievement"
                  accept="image/jpeg,image/png,image/webp"
                  emptyText={t("settings.professional.achievements.empty")}
                />
              </SectionCard>
              <SectionCard
                icon={BadgeCheck}
                title={t("settings.professional.certificates.title")}
                description={t("settings.professional.certificates.desc")}
              >
                <CredentialsManager
                  coachId={coachId}
                  userId={user.id}
                  type="certificate"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  emptyText={t("settings.professional.certificates.empty")}
                />
              </SectionCard>
            </div>
          ),
          notifications: (
            <SectionCard
              icon={Bell}
              title={t("settings.notifications.title")}
              description={t("settings.notifications.desc")}
            >
              <NotificationsPrefs />
            </SectionCard>
          ),
          appearance: (
            <SectionCard
              icon={Palette}
              title={t("settings.appearance.title")}
              description={t("settings.appearance.desc")}
            >
              <AppearancePrefs />
            </SectionCard>
          ),
          security: (
            <SectionCard
              icon={ShieldCheck}
              title={t("settings.security.title")}
              description={t("settings.security.desc")}
            >
              <SecurityControls hasEmailIdentity={hasEmailIdentity} />
            </SectionCard>
          ),
          payouts: (
            <SectionCard
              icon={CreditCard}
              title={t("settings.payouts.cardTitle")}
              description={t("settings.payouts.desc")}
              action={payoutsBadge}
            >
              <div className="space-y-4">
                {stripeAccountId && (
                  <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
                    <Lock className="size-3.5 shrink-0 text-faint" aria-hidden="true" />
                    <span className="min-w-0 truncate font-mono">
                      {t("settings.payouts.connectIdLabel", { id: stripeAccountId })}
                    </span>
                  </p>
                )}
                <SettingsClient stripeAccountId={stripeAccountId} />
              </div>
            </SectionCard>
          ),
        }}
      />
    </div>
  );
}
