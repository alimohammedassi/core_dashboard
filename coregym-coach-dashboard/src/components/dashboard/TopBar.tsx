"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, LogOut, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GlobalLink } from "@/components/shared/link";
import { SidebarNav, type NavItem } from "@/components/dashboard/SidebarNav";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { LangToggle } from "@/components/dashboard/LangToggle";
import { useI18n } from "@/lib/i18n/client";

export type TopbarProfile = {
  name: string;
  email: string;
  avatarUrl: string | null;
  initials: string;
};

function CoachAvatar({ profile, size }: { profile: TopbarProfile; size: "sm" | "md" }) {
  return (
    <Avatar className={size === "sm" ? "size-8" : "size-9"}>
      {profile.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt="" /> : null}
      <AvatarFallback className="text-xs">{profile.initials}</AvatarFallback>
    </Avatar>
  );
}

/**
 * Fixed dashboard header: breadcrumb ("Portal › {section}") on desktop, brand +
 * drawer trigger on mobile. The drawer holds the same nav as the desktop rail
 * plus the coach footer (language, theme, sign-out, profile). Only the avatar
 * is live in the header — it deep-links to Settings.
 */
export function Topbar({ items, profile }: { items: NavItem[]; profile: TopbarProfile }) {
  const pathname = usePathname();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);

  // Longest matching nav prefix wins, so /dashboard/subscribers/[id] still
  // reads "Subscribers"; unmatched paths fall back to Overview.
  const current =
    [...items]
      .filter((i) => (i.href === "/dashboard" ? pathname === i.href : pathname.startsWith(i.href)))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? items[0];

  return (
    <>
      <header className="fixed top-0 start-0 end-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md md:start-64 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t("common.shell.openMenu")}
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <GlobalLink href="/dashboard" className="flex items-center gap-2 md:hidden">
            <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-primary shadow-[0_0_12px_rgba(178,215,66,0.3)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny brand mark, plain img keeps it unoptimized+sharp */}
              <img src="/brand/coregym-mark.png" alt="CoreGym" className="size-8 object-cover" />
            </span>
          </GlobalLink>
          <nav aria-label={t("common.shell.portal")} className="hidden min-w-0 items-center gap-1 text-label-md md:flex">
            <span className="text-muted-foreground">{t("common.shell.portal")}</span>
            <ChevronRight className="size-3.5 text-faint rtl:rotate-180" />
            <span className="font-semibold text-foreground">{current?.label}</span>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <GlobalLink
            href="/dashboard/settings"
            aria-label={profile.name}
            className="rounded-full ring-2 ring-primary/40 transition-opacity hover:opacity-80"
          >
            <CoachAvatar profile={profile} size="sm" />
          </GlobalLink>
        </div>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={lang === "ar" ? "right" : "left"} className="w-72 gap-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">{t("common.shell.portal")}</SheetTitle>
          <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-3">
            <span className="flex size-9 items-center justify-center overflow-hidden rounded-lg bg-primary p-1 shadow-[0_0_12px_rgba(178,215,66,0.3)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny brand mark, plain img keeps it unoptimized+sharp */}
              <img src="/brand/coregym-mark.png" alt="" className="size-8 object-cover" />
            </span>
            <span className="font-display text-headline-sm uppercase tracking-tight text-foreground">
              CoreGym
            </span>
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-label-sm uppercase tracking-wider text-primary">
              {t("common.shell.coach")}
            </span>
          </div>
          <SidebarNav items={items} onNavigate={() => setOpen(false)} />
          <div className="flex flex-col gap-3 border-t border-sidebar-border p-3">
            <div className="flex items-center justify-between gap-1">
              <LangToggle />
              <div className="flex items-center gap-1">
                <ThemeToggle />
                <form action="/api/auth/signout" method="post">
                  <Button type="submit" variant="ghost" size="icon" aria-label={t("common.shell.signOut")}>
                    <LogOut className="size-4" />
                  </Button>
                </form>
              </div>
            </div>
            <div className="flex items-center gap-2.5 border-t border-sidebar-border/60 pt-3">
              <CoachAvatar profile={profile} size="md" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-label-md text-foreground">{profile.name}</span>
                <span className="truncate text-body-sm text-faint">{profile.email}</span>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
