import { Skeleton } from "@/components/ui/skeleton";

export default function RevenueLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header + actions */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-5 w-40 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* KPI deck */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl bg-card p-5 ring-1 ring-border">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-8 w-24" />
            <Skeleton className="mt-4 h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Bento: weekly velocity chart + settlement routing */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-xl bg-card p-5 ring-1 ring-border lg:col-span-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="mt-6 flex h-40 items-end gap-3">
            {[35, 55, 20, 70, 45, 80, 30].map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%` }} />
            ))}
          </div>
          <Skeleton className="mt-4 h-3 w-full" />
        </div>
        <div className="rounded-xl bg-card p-5 ring-1 ring-border lg:col-span-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-2 h-3 w-48" />
          <div className="mt-8 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>

      {/* Ledger */}
      <div className="rounded-xl bg-card ring-1 ring-border">
        <div className="flex items-center justify-between p-5 pb-3">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-9 w-full sm:w-56 rounded-lg" />
        </div>
        <div className="space-y-2 px-5 pb-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>

      {/* Payout cards */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg bg-background p-4 ring-1 ring-border">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-10 w-28" />
            <Skeleton className="mt-2 h-3 w-24" />
            <Skeleton className="mt-3 h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
