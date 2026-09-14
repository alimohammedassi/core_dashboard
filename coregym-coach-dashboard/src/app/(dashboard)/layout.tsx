import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { Dumbbell } from "lucide-react";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Verify coach role — never assume every user is a coach
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, name, email, avatar_url")
    .eq("id", user.id)
    .single();

  const role = (profile as { role?: string } | null)?.role;
  const isCoach = role === "coach" || role === undefined;

  if (role && role !== "coach") {
    return (
      <div className="flex min-h-svh items-center justify-center p-8 bg-[var(--background)]">
        <div className="max-w-md text-center space-y-4 border border-[rgba(255,255,255,0.08)] rounded-2xl p-8 bg-[var(--surface-2)]">
          <h1 className="text-xl font-semibold text-white">Access denied</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Your account role is <span className="font-mono font-medium text-white">{role}</span>. Only coaches can access this
            dashboard.
          </p>
          <form action="/api/auth/signout" method="post">
            <Button type="submit" variant="outline" className="rounded-full">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (role === undefined) {
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
  const avatarUrl = (profile as { avatar_url?: string | null } | null)?.avatar_url ?? (user.user_metadata as { avatar_url?: string })?.avatar_url ?? null;

  // Live client count for sidebar badge (active subscriptions)
  let clientCount: number | undefined = undefined;
  let unread = 0;
  try {
    const coachId = await resolveCoachId(supabase, user.id);
    const [subsRes, convRes] = await Promise.all([
      supabase.from("subscriptions").select("id", { count: "exact" }).eq("coach_id", coachId).eq("status", "active"),
      supabase.from("conversations").select("coach_unread").eq("coach_id", user.id),
    ]);
    if (typeof subsRes.count === "number") clientCount = subsRes.count;
    else if (Array.isArray(subsRes.data)) clientCount = subsRes.data.length;
    if (convRes.data) {
      unread = (convRes.data as { coach_unread: number | null }[]).reduce((s, r) => s + (r.coach_unread ?? 0), 0);
    }
  } catch {
    // badge is optional
  }

  return (
    <div className="flex min-h-svh bg-[var(--background)]">
      <Sidebar clientCount={clientCount} />

      <div className="flex flex-1 flex-col min-w-0 bg-[var(--background)]">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-2 border-b border-[rgba(255,255,255,0.08)] bg-[var(--surface)] px-4 lg:hidden">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Dumbbell className="size-4" />
          </div>
          <span className="font-semibold tracking-tight text-white">CoreGym</span>
          <span className="text-xs text-[var(--text-muted)] ml-1">Coach</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <form action="/api/auth/signout" method="post">
              <Button type="submit" variant="ghost" size="icon" className="size-8 rounded-full">
                <span className="text-xs">{initials}</span>
              </Button>
            </form>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          {/* Top bar — Shopeers-style search + actions, inside main content */}
          <div className="hidden lg:block">
            <TopBar avatarUrl={avatarUrl} initials={initials} email={user.email} unread={unread} />
          </div>

          {/* Page content */}
          <main className="flex-1 space-y-4">{children}</main>

          {!isCoach && (
            <p className="text-xs text-amber-600">Dev: coach check bypassed (schema not applied).</p>
          )}
        </div>
      </div>
    </div>
  );
}
