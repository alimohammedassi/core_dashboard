import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarNav } from "@/components/dashboard/SidebarNav";
import { Topbar } from "@/components/dashboard/Topbar";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { LangToggle } from "@/components/dashboard/LangToggle";
import { LogOut } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";

const nav = [
  { href: "/dashboard", labelKey: "overview", icon: "LayoutDashboard" },
  { href: "/dashboard/workouts", labelKey: "workouts", icon: "ClipboardList" },
  { href: "/dashboard/programs", labelKey: "programs", icon: "CalendarDays" },
  { href: "/dashboard/nutrition", labelKey: "nutrition", icon: "Apple" },
  { href: "/dashboard/chat", labelKey: "chat", icon: "MessageSquare" },
  { href: "/dashboard/subscribers", labelKey: "subscribers", icon: "Users" },
  { href: "/dashboard/plans", labelKey: "plans", icon: "CreditCard" },
  { href: "/dashboard/revenue", labelKey: "revenue", icon: "TrendingUp" },
  { href: "/dashboard/settings", labelKey: "settings", icon: "Settings" },
] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { t } = await getI18n();

  if (!user) {
    redirect("/login");
  }

  // PERF-01: profiles (role), coaches id and coach_onboarding are independent
  // reads once we have user.id — run them in ONE parallel round instead of the
  // previous 2-layer waterfall. The coaches read goes through resolveCoachId
  // (React-cache()d per request with the SAME cached client the pages use), so
  // the layout and every dashboard page share a single coaches round-trip
  // instead of duplicating it.
  const [profileRes, coachIdResult, onboardingRes] = await Promise.all([
    supabase.from("profiles").select("role, full_name, name, email, avatar_url").eq("id", user.id).single(),
    resolveCoachId(supabase, user.id),
    supabase.from("coach_onboarding").select("is_completed").eq("user_id", user.id).maybeSingle(),
  ]);
  const profile = profileRes.data;
  const hasCoachRow = coachIdResult !== user.id;

  // If profiles table not yet migrated, profile will be null — allow through in dev but flag
  const role = (profile as { role?: string } | null)?.role;
  // S12: the undefined-role bypass is DEV ONLY. In production a missing role
  // fails closed (deny panel below) instead of silently granting access.
  const isDevBypass = role === undefined && process.env.NODE_ENV !== "production";
  const isCoach = role === "coach" || isDevBypass;

  // ── Coach onboarding completeness gate ──────────────────────────────────────
  // Coaches whose profile is not yet complete (no coaches row or unfinished
  // coach_onboarding) are routed to the onboarding wizard instead of the
  // dashboard. Existing completed coaches are unaffected (verified: all live
  // coach rows have is_completed = true). role === undefined keeps the
  // existing dev-mode tolerance.
  if (isCoach && role === "coach") {
    const complete =
      hasCoachRow &&
      (onboardingRes.data as { is_completed?: boolean } | null)?.is_completed === true;
    if (!complete) {
      redirect("/onboarding");
    }
  }

  if (role && role !== "coach") {
    return (
      <div className="flex min-h-svh items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4 border rounded-xl p-8">
          <h1 className="text-xl font-semibold">{t("common.shell.accessDenied")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("common.shell.notCoach", { role: role })}
          </p>
          <form action="/api/auth/signout" method="post">
            <Button type="submit" variant="outline">
              {t("common.shell.signOut")}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (role === undefined && !isDevBypass) {
    // Production fail-closed (S12): role unreadable and this is not dev.
    return (
      <div className="flex min-h-svh items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4 border rounded-xl p-8">
          <h1 className="text-xl font-semibold">{t("common.shell.accessDenied")}</h1>
          <p className="text-sm text-muted-foreground">{t("common.shell.notVerified")}</p>
          <form action="/api/auth/signout" method="post">
            <Button type="submit" variant="outline">
              {t("common.shell.signOut")}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (role === undefined) {
    // Dev hint when schema not applied
    console.warn("[DashboardLayout] profiles.role not found — RLS/schema.sql may not be applied yet.");
  }

  const displayName =
    (profile as { full_name?: string; name?: string } | null)?.full_name ||
    (profile as { name?: string } | null)?.name ||
    user.email ||
    "Coach";
  const initials = displayName
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatarUrl = (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null;
  const navItems = nav.map((item) => ({
    href: item.href,
    label: t(`common.nav.${item.labelKey}`),
    icon: item.icon,
  }));

  return (
    <div className="dashboard-shell min-h-svh bg-background">
      {/* Desktop rail — Stitch: surface-container-lowest slab, volt brand mark,
          active items on the container-high step with a 2px volt start edge. */}
      <aside className="fixed inset-y-0 start-0 z-50 hidden w-64 flex-col border-e border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border/60 px-3">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary p-1 shadow-[0_0_12px_rgba(178,215,66,0.3)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny brand mark, plain img keeps it unoptimized+sharp */}
            <img src="/brand/coregym-mark.png" alt="" className="size-8 object-cover" />
          </span>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="font-display text-headline-sm uppercase tracking-tight text-foreground">
              CoreGym
            </span>
            <span className="rounded border border-primary/40 bg-primary/20 px-1.5 py-0.5 text-label-sm uppercase tracking-wider text-primary">
              {t("common.shell.coach")}
            </span>
          </div>
        </div>

        <SidebarNav items={navItems} />

        <div className="flex shrink-0 flex-col gap-3 border-t border-sidebar-border/60 p-3">
          <div className="flex items-center justify-between gap-1">
            <LangToggle />
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <form action="/api/auth/signout" method="post">
                <Button type="submit" variant="ghost" size="icon" className="hover:text-destructive" aria-label={t("common.shell.signOut")}>
                  <LogOut className="size-4" />
                </Button>
              </form>
            </div>
          </div>
          <div className="flex items-center gap-2.5 border-t border-sidebar-border/40 pt-3">
            <span className="relative shrink-0">
              <Avatar className="size-8">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 end-0 size-2 rounded-full bg-primary ring-2 ring-sidebar" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-label-md text-foreground">{displayName}</span>
              <span className="truncate text-body-sm text-faint">{user.email}</span>
            </div>
          </div>
          {!isCoach && (
            <p className="text-xs text-warning">{t("common.shell.devBypass")}</p>
          )}
        </div>
      </aside>

      {/* Content column — the fixed Topbar supplies chrome on every width */}
      <div className="flex min-h-svh flex-col md:ps-64">
        <Topbar
          items={navItems}
          profile={{ name: displayName, email: user.email ?? "", avatarUrl, initials }}
        />
        <main className="flex-1 px-4 pb-12 pt-[4.75rem] md:px-6 xl:px-8">{children}</main>
      </div>
    </div>
  );
}
