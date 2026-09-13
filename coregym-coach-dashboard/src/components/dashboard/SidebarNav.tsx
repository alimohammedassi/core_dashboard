"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  MessageSquare,
  Users,
  CreditCard,
  Settings,
  type LucideIcon,
} from "lucide-react";

// Icons are referenced by name because React components cannot cross the
// server→client boundary as props.
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  MessageSquare,
  Users,
  CreditCard,
  Settings,
};

export type NavItem = { href: string; label: string; icon: string };

// Active item: lime tint background + lime left indicator (spec §97).
// Inactive items keep muted icons so the current route reads instantly.
export function SidebarNav({ items, layout = "sidebar" }: { items: NavItem[]; layout?: "sidebar" | "topbar" }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  if (layout === "topbar") {
    return (
      <nav className="ml-auto flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                active
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex-1 space-y-1 p-3">
      {items.map((item) => {
        const active = isActive(item.href);
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-primary/10 font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
            )}
            <Icon className={`size-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
