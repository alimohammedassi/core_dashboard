"use client";

import Link from "next/link";
import { Crown } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

export function UpgradeCard() {
  return (
    <div className="rounded-2xl bg-[var(--primary)] p-4 text-[var(--primary-foreground)]">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-black/10">
          <Crown className="size-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">Upgrade to Premium</p>
      </div>
      <p className="mt-1 text-xs leading-snug opacity-80">Manage your subscription plans and pricing.</p>
      <Link href="/dashboard/plans" className={cn(buttonVariants({ size: "sm" }), "mt-3 w-full rounded-full bg-black text-white hover:bg-black/90 text-xs font-medium h-8 flex items-center justify-center")}>
        View plans
      </Link>
    </div>
  );
}
