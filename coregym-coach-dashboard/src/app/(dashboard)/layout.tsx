import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { SidebarNav } from "@/components/dashboard/SidebarNav";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { LangToggle } from "@/components/dashboard/LangToggle";
import { Dumbbell, LogOut } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";

const nav = [
  { href: "/dashboard", labelKey: "overview", icon: "LayoutDashboard" },
  { href: "/dashboard/workouts", labelKey: "workouts", icon: "ClipboardList" },
  { href: "/dashboard/programs", labelKey: "programs", icon: "CalendarDays" },
  { href: "/dashboard/nutrition", labelKey: "nutrition", icon: "Apple" },
  { href: "/dashboard/chat", labelKey: "chat", icon: "MessageSquare" },
  { href: "/dashboard/subscribers", labelKey: "subscribers", icon: "Users" },
  { href: "/dashboard/plans", labelKey: "plans", icon: "CreditCard" },
  { href: "/dashboard/revenue", labelKey: "revenue", icon: "CreditCard" },
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
    supabase.from("profiles").select("role, full_name, name, email").eq("id", user.id).single(),
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

  return (
    <div className="flex min-h-svh">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Dumbbell className="size-4" />
          </div>
          <span className="font-semibold tracking-tight">CoreGym</span>
          <span className="text-xs text-muted-foreground ms-1">{t("common.shell.coach")}</span>
        </div>
        <SidebarNav items={nav.map((item) => ({ href: item.href, label: t(`common.nav.${item.labelKey}`), icon: item.icon }))} />
        <Separator />
        <div className="p-3 flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <LangToggle />
          <ThemeToggle />
          <form action="/api/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="icon" aria-label={t("common.shell.signOut")}>
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
        {!isCoach && (
          <p className="px-3 pb-3 text-xs text-amber-600">{t("common.shell.devBypass")}</p>
        )}
      </aside>

      {/* Mobile top bar */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden">
          <Dumbbell className="size-5" />
          <span className="font-semibold">CoreGym {t("common.shell.coach")}</span>
          <SidebarNav items={nav.map((item) => ({ href: item.href, label: t(`common.nav.${item.labelKey}`), icon: item.icon }))} layout="topbar" />
        </header>
        <main className="flex-1 bg-muted/20 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
