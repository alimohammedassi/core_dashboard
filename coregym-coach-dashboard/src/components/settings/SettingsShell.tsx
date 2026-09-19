"use client";

import * as React from "react";
import { User, BadgeCheck, Bell, Palette, ShieldCheck, CreditCard } from "lucide-react";
import { cn } from "cn";
import { CardTitle, CardDescription } from "@/components/ui/card";

export type SettingsSection = "account" | "professional" | "notifications" | "appearance" | "security" | "payouts";

const NAV: { key: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { key: "account", label: "Account", icon: User, hint: "Photo, name, email" },
  { key: "professional", label: "Professional profile", icon: BadgeCheck, hint: "Bio, pricing, policy, credentials" },
  { key: "notifications", label: "Notifications", icon: Bell, hint: "Reminders and alerts" },
  { key: "appearance", label: "Appearance", icon: Palette, hint: "Theme and language" },
  { key: "security", label: "Security", icon: ShieldCheck, hint: "Password and sessions" },
  { key: "payouts", label: "Payouts", icon: CreditCard, hint: "Stripe Connect" },
];

// Sectioned settings layout: left nav, right content (stacks on mobile).
export function SettingsShell({ sections }: { sections: Record<SettingsSection, React.ReactNode> }) {
  const [section, setSection] = React.useState<SettingsSection>("account");

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      {/* Left nav */}
      <nav className="min-w-0 lg:sticky lg:top-6 lg:self-start" aria-label="Settings sections">
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map((item) => {
            const active = section === item.key;
            return (
              <li key={item.key} className="shrink-0 lg:w-full">
                <button
                  type="button"
                  onClick={() => setSection(item.key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-primary/10 font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="whitespace-nowrap lg:whitespace-normal">
                    {item.label}
                    <span className="hidden text-xs font-normal text-muted-foreground lg:block">{item.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Right content */}
      <div className="min-w-0 space-y-6">{sections[section]}</div>
    </div>
  );
}

export { NAV as SETTINGS_NAV };

// Shared header for a settings card
export function SettingsCardHeader({ title, description }: { title: string; description: string }) {
  return (
    <>
      <CardTitle className="text-base">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </>
  );
}
