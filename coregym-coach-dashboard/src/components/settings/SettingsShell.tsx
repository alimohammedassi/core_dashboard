"use client";

import * as React from "react";
import { User, BadgeCheck, Bell, Palette, ShieldCheck, CreditCard } from "lucide-react";
import { cn } from "cn";
import { CardTitle, CardDescription } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/client";

export type SettingsSection = "account" | "professional" | "notifications" | "appearance" | "security" | "payouts";

export function SettingsShell({ sections }: { sections: Record<SettingsSection, React.ReactNode> }) {
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

  // Sectioned settings layout: Stitch "Configuration" rail (numbered, sticky),
  // content stacks on mobile.
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* Side nav */}
      <nav className="min-w-0 lg:sticky lg:top-[4.75rem] lg:self-start" aria-label={t("settings.nav.aria")}>
        <div className="mb-2 hidden px-3 text-label-sm uppercase tracking-wider text-faint lg:block">
          {t("settings.nav.config")}
        </div>
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map((item, i) => {
            const active = section === item.key;
            return (
              <li key={item.key} className="shrink-0 lg:w-full">
                <button
                  type="button"
                  onClick={() => setSection(item.key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-e-lg border-s-2 px-3 py-2 text-start text-sm transition-colors",
                    active
                      ? "border-primary bg-sidebar-accent font-semibold text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-faint")} />
                  <span className="min-w-0 whitespace-nowrap lg:whitespace-normal">
                    <span className="me-1.5 text-faint">{i + 1}.</span>
                    {item.label}
                    <span className="hidden text-xs font-normal text-muted-foreground lg:block">{item.hint}</span>
                  </span>
                  {active && <span className="ms-auto size-1.5 shrink-0 rounded-full bg-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Content */}
      <div className="min-w-0 space-y-6">{sections[section]}</div>
    </div>
  );
}

// Shared header for a settings card
export function SettingsCardHeader({ title, description }: { title: string; description: string }) {
  return (
    <>
      <CardTitle className="text-base">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </>
  );
}
