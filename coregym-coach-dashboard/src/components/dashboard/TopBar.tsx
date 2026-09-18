"use client";

import Link from "next/link";
import { MessageSquare, LogOut, ChevronDown } from "lucide-react";
import { ClientSearch } from "@/components/dashboard/ClientSearch";
import { SidebarNav, type NavItem } from "@/components/dashboard/SidebarNav";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dumbbell } from "lucide-react";

// Top bar: client search · theme toggle · chat with unread badge · coach avatar.
// On mobile it also carries the logo and the scrollable nav row.
export function TopBar({
  displayName,
  email,
  initials,
  unread,
  nav,
}: {
  displayName: string;
  email: string;
  initials: string;
  unread: number;
  nav: NavItem[];
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4 md:px-6">
        {/* Mobile logo */}
        <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Dumbbell className="size-4" />
          </span>
          <span className="font-semibold tracking-tight">CoreGym</span>
        </Link>

        <ClientSearch className="md:ml-2" />

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <Link
            href="/dashboard/chat"
            aria-label={`Chat${unread ? ` — ${unread} unread` : ""}`}
            className="relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MessageSquare className="size-4" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Account menu"
              className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Avatar className="size-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden min-w-0 text-left lg:block">
                <span className="block truncate text-sm leading-tight font-semibold">{displayName}</span>
                <span className="block truncate text-xs leading-tight text-muted-foreground">{email}</span>
              </span>
              <ChevronDown className="hidden size-3.5 text-muted-foreground lg:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <span className="block truncate text-sm font-semibold">{displayName}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">{email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/dashboard/settings" />}>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={
                  // Sign out is a POST form, not a plain navigation
                  <form action="/api/auth/signout" method="post" className="w-full">
                    <button type="submit" className="flex w-full items-center gap-2">
                      <LogOut className="size-4" /> Sign out
                    </button>
                  </form>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile nav row (sidebar collapses to this under md) */}
      <div className="border-t border-border px-2 py-1.5 md:hidden">
        <SidebarNav items={nav} layout="topbar" />
      </div>
    </header>
  );
}
