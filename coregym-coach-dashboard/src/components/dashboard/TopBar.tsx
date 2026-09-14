"use client";

import { Search, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";

export function TopBar({
  avatarUrl,
  initials,
  email,
  unread,
}: {
  avatarUrl?: string | null;
  initials: string;
  email?: string | null;
  unread?: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] px-3 py-2 md:px-4">
      <div className="relative flex-1 max-w-[320px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          placeholder="Search anything..."
          className="h-8 rounded-full border-0 bg-[var(--surface-3)] pl-9 pr-12 text-sm placeholder:text-[var(--text-muted)] focus-visible:ring-0 focus-visible:border-0"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] border border-[rgba(255,255,255,0.08)]">
          ⌘K
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <Button variant="ghost" size="icon" className="relative size-8 rounded-full hover:bg-[var(--surface-3)]">
          <Bell className="size-4 text-[var(--text-secondary)]" />
          {unread !== undefined && unread > 0 && (
            <span className="absolute right-1 top-1 size-2 rounded-full bg-[var(--primary)] ring-2 ring-[var(--surface-2)]" />
          )}
          <span className="sr-only">Notifications</span>
        </Button>

        <div className="ml-1 flex items-center gap-2">
          <Avatar className="size-8 ring-2 ring-[var(--primary)]/30">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={email ?? "Coach"} /> : null}
            <AvatarFallback className="bg-[var(--surface-3)] text-xs font-medium text-white">{initials}</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </div>
  );
}
