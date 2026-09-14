"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ClipboardList,
  CreditCard,
  BarChart3,
  MessageSquare,
  Settings,
  CircleHelp,
  ChevronDown,
  PanelLeftClose,
  Dumbbell,
  ArrowLeftRight,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UpgradeCard } from "@/components/dashboard/UpgradeCard";
import { cn } from "cn";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number | string;
};

const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/subscribers", label: "Clients", icon: Users },
  { href: "/dashboard/programs", label: "Programs", icon: CalendarDays },
  { href: "/dashboard/workouts", label: "Sessions", icon: ClipboardList },
];

const analyticsNav: NavItem[] = [
  { href: "/dashboard/revenue", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
];

const subPayments = [
  { href: "/dashboard/revenue", label: "Transactions", icon: ArrowLeftRight },
  { href: "/dashboard/revenue", label: "Payouts", icon: Wallet },
];

export function Sidebar({ clientCount }: { clientCount?: number }) {
  const pathname = usePathname();
  const [paymentsOpen, setPaymentsOpen] = React.useState(true);
  const [collapsed, setCollapsed] = React.useState(false);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const NavLink = ({ item, active }: { item: NavItem; active: boolean }) => {
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        className={cn(
          "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
          active
            ? "bg-[var(--surface-2)] font-semibold text-white"
            : "font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-white"
        )}
      >
        {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--primary)]" />}
        <Icon className={cn("size-4", active ? "text-white" : "text-[var(--text-muted)]")} />
        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
        {!collapsed && item.badge !== undefined && (
          <Badge
            variant="secondary"
            className="h-5 min-w-5 justify-center rounded-full bg-[var(--surface-3)] px-1.5 text-[11px] font-medium text-[var(--text-secondary)] border-0"
          >
            {item.badge}
          </Badge>
        )}
      </Link>
    );
  };

  if (collapsed) {
    return (
      <aside className="hidden w-[64px] shrink-0 flex-col items-center border-r border-[rgba(255,255,255,0.08)] bg-[var(--surface)] py-3 lg:flex">
        <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
          <Dumbbell className="size-4" />
        </div>
        <button
          onClick={() => setCollapsed(false)}
          className="mt-3 rounded p-1 hover:bg-[var(--surface-2)]"
          aria-label="Expand sidebar"
        >
          <PanelLeftClose className="size-3.5 rotate-180 text-[var(--text-muted)]" />
        </button>
        <nav className="mt-6 flex flex-col gap-1">
          {[...primaryNav, { href: "#payments", label: "Payments", icon: CreditCard } as NavItem, ...analyticsNav].map((it) => {
            const active = isActive(it.href);
            const Icon = it.icon;
            return (
              <Link
                key={it.label}
                href={it.href === "#payments" ? "/dashboard/revenue" : it.href}
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-xl transition-colors",
                  active ? "bg-[var(--surface-2)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-white"
                )}
                title={it.label}
              >
                <Icon className="size-4" />
                {active && <span className="absolute left-0 h-5 w-[2px] rounded-full bg-[var(--primary)]" />}
              </Link>
            );
          })}
        </nav>
      </aside>
    );
  }

  return (
    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-[rgba(255,255,255,0.08)] bg-[var(--surface)] lg:flex">
      {/* Logo row */}
      <div className="flex h-14 items-center gap-2 border-b border-[rgba(255,255,255,0.08)] px-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
          <Dumbbell className="size-4" />
        </div>
        <span className="font-semibold tracking-tight text-white">CoreGym</span>
        <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] border border-[rgba(255,255,255,0.06)]">Coach</span>
        <button onClick={() => setCollapsed((v) => !v)} className="ml-auto rounded p-1 hover:bg-[var(--surface-2)]" aria-label="Collapse sidebar">
          <PanelLeftClose className="size-3.5 text-[var(--text-muted)]" />
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto p-3 gap-4">
        <nav className="space-y-1">
          {primaryNav.map((item) => {
            const badgeVal = item.label === "Clients" && clientCount !== undefined ? clientCount : item.badge;
            return <NavLink key={item.href} item={{ ...item, badge: badgeVal }} active={isActive(item.href)} />;
          })}

          {/* Payments expandable */}
          <div>
            <button
              onClick={() => setPaymentsOpen((v) => !v)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                isActive("/dashboard/revenue") || isActive("/dashboard/plans")
                  ? "bg-[var(--surface-2)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-white"
              )}
            >
              <CreditCard className="size-4 text-[var(--text-muted)]" />
              <span className="flex-1 text-left">Payments</span>
              <ChevronDown className={cn("size-3.5 transition-transform text-[var(--text-muted)]", paymentsOpen ? "rotate-180" : "")} />
            </button>
            {paymentsOpen && (
              <div className="ml-4 mt-1 space-y-1 border-l border-[rgba(255,255,255,0.06)] pl-3">
                {subPayments.map((s) => {
                  const active = pathname === s.href;
                  const Icon = s.icon;
                  return (
                    <Link
                      key={s.label}
                      href={s.href}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
                        active ? "bg-[var(--surface-2)] font-medium text-white" : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-white"
                      )}
                    >
                      <Icon className="size-3.5" />
                      {s.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {analyticsNav.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </nav>

        <Separator className="bg-[rgba(255,255,255,0.08)]" />

        <nav className="space-y-1">
          <NavLink item={{ href: "/dashboard/settings", label: "Settings", icon: Settings }} active={isActive("/dashboard/settings")} />
          <NavLink item={{ href: "/dashboard/settings", label: "Help & Support", icon: CircleHelp }} active={false} />
        </nav>

        <div className="mt-auto pt-2">
          <UpgradeCard />
        </div>
      </div>
    </aside>
  );
}
