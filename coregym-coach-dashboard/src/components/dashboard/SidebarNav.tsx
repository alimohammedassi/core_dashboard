"use client";

import { GlobalLink } from "@/components/shared/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  MessageSquare,
  Users,
  CreditCard,
  Settings,
  Apple,
  TrendingUp,
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
  Apple,
  TrendingUp,
};

export type NavItem = { href: string; label: string; icon: string };

// Stitch rail: active items get the container-high graphite slab, a 2px volt
// inline-start edge and a volt icon; inactive items stay muted until hover.
// The right-edge rounding keeps the slab flush against the rail border.
export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="flex flex-1 flex-col gap-1 px-2 py-3">
      {items.map((item) => {
        const active = isActive(item.href);
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        return (
          <GlobalLink
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-e-lg border-s-2 px-3 py-2 text-label-lg transition-colors ${
              active
                ? "border-primary bg-sidebar-accent text-foreground"
                : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Icon
              className={`size-5 shrink-0 transition-colors ${
                active ? "text-primary" : "text-faint group-hover:text-foreground"
              }`}
            />
            {item.label}
          </GlobalLink>
        );
      })}
    </nav>
  );
}
