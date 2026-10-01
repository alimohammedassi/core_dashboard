"use client";

import * as React from "react";
import { User, BadgeCheck, Bell, Palette, ShieldCheck, CreditCard, CheckCircle2 } from "lucide-react";
import { cn } from "cn";
import { useI18n } from "@/lib/i18n/client";

export type SettingsSection = "account" | "professional" | "notifications" | "appearance" | "security" | "payouts";

/**
 * Stitch "Configuration" shell: a boxed rail (sticky on desktop, horizontal
 * scroller on mobile) plus ALL sections stacked in one column — rail items
 * smooth-scroll to their section instead of swapping it in.
 */
export function SettingsShell({
  sections,
  stripeConnected = false,
}: {
  sections: Record<SettingsSection, React.ReactNode>;
  stripeConnected?: boolean;
}) {
  const { t } = useI18n();
  const [section, setSection] = React.useState<SettingsSection>("account");

  const NAV: { key: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
    { key: "account", label: t("settings.nav.account.label"), icon: User, hint: t("settings.nav.account.hint") },
    { key: "professional", label: t("settings.nav.professional.label"), icon: BadgeCheck, hint: t("settings.nav.professional.hint") },
    { key: "notifications", label: t("settings.nav.notifications.label"), icon: Bell, hint: t("settings.nav.notifications.hint") },
    { key: "appearance", label: t("settings.nav.appearance.label"), icon: Palette, hint: t("settings.nav.appearance.hint") },
    { key: "security", label: t("settings.nav.security.label"), icon: ShieldCheck, hint: t("settings.nav.security.hint") },
    { key: "payouts", label: t("settings.nav.payouts.label"), icon: CreditCard, hint: t("settings.nav.payouts.hint") },
  ];

  function goTo(key: SettingsSection) {
    setSection(key);
    document.getElementById(`settings-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Side rail */}
      <nav className="min-w-0 lg:col-span-3 lg:sticky lg:top-20 lg:self-start" aria-label={t("settings.nav.aria")}>
        <div className="rounded-xl bg-sidebar p-2">
          <p className="hidden px-3 py-2 text-label-sm uppercase tracking-wider text-faint lg:block">
            {t("settings.nav.config")}
          </p>
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map((item) => {
              const active = section === item.key;
              // Honest status marker: the mint check only appears once Stripe
              // is actually connected; otherwise the active glow dot leads.
              const connected = item.key === "payouts" && stripeConnected;
              return (
                <li key={item.key} className="shrink-0 lg:w-full">
                  <button
                    type="button"
                    onClick={() => goTo(item.key)}
                    aria-current={active ? "page" : undefined}
                    title={item.hint}
                    className={cn(
                      "group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-start text-label-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                      active && "bg-sidebar-accent font-semibold text-primary"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <item.icon
                        className={cn(
                          "size-[18px] shrink-0 text-faint transition-colors group-hover:text-primary",
                          active && "text-primary"
                        )}
                      />
                      <span className="truncate lg:whitespace-normal">{item.label}</span>
                    </span>
                    {connected ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-mint" aria-hidden="true" />
                    ) : (
                      active && (
                        <span className="size-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_rgba(205,244,92,0.9)]" aria-hidden="true" />
                      )
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Content — every section stacked; rail anchors scroll between them */}
      <div className="min-w-0 flex flex-col gap-5 lg:col-span-9">
        {(Object.keys(sections) as SettingsSection[]).map((key) => (
          <section key={key} id={`settings-${key}`} className="scroll-mt-24">
            {sections[key]}
          </section>
        ))}
      </div>
    </div>
  );
}
