import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { SidebarNav } from "@/components/dashboard/SidebarNav";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { Dumbbell, LogOut } from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Overview", icon: "LayoutDashboard" },
  { href: "/dashboard/workouts", label: "Workouts", icon: "ClipboardList" },
  { href: "/dashboard/programs", label: "Programs", icon: "CalendarDays" },
  { href: "/dashboard/chat", label: "Chat", icon: "MessageSquare" },
  { href: "/dashboard/subscribers", label: "Subscribers", icon: "Users" },
  { href: "/dashboard/plans", label: "Plans", icon: "CreditCard" },
  { href: "/dashboard/revenue", label: "Revenue", icon: "CreditCard" },
  { href: "/dashboard/settings", label: "Settings", icon: "Settings" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Verify coach role — never assume every user is a coach
  const { data: profile } = await supabase.from("profiles").select("role, full_name, name, email").eq("id", user.id).single();

  // If profiles table not yet migrated, profile will be null — allow through in dev but flag
  const role = (profile as { role?: string } | null)?.role;
  const isCoach = role === "coach" || role === undefined; // undefined = schema not applied yet (dev mode)

  if (role && role !== "coach") {
    return (
      <div className="flex min-h-svh items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4 border rounded-xl p-8">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            Your account role is <span className="font-mono font-medium">{role}</span>. Only coaches can access this
            dashboard.
          </p>
          <form action="/api/auth/signout" method="post">
            <Button type="submit" variant="outline">
              Sign out
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
          <span className="text-xs text-muted-foreground ml-1">Coach</span>
        </div>
        <SidebarNav items={nav} />
        <Separator />
        <div className="p-3 flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <ThemeToggle />
          <form action="/api/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
        {!isCoach && (
          <p className="px-3 pb-3 text-xs text-amber-600">Dev: coach check bypassed (schema not applied).</p>
        )}
      </aside>

      {/* Mobile top bar */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden">
          <Dumbbell className="size-5" />
          <span className="font-semibold">CoreGym Coach</span>
          <SidebarNav items={nav} layout="topbar" />
        </header>
        <main className="flex-1 bg-muted/20 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
