import { Skeleton } from "@/components/ui/skeleton";

export default function PlansLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header + action */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* KPI deck */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl bg-card p-5 ring-1 ring-border">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-8 w-20" />
            <Skeleton className="mt-4 h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Section row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-3 w-32" />
      </div>

      {/* Plan cards */}
      <div className="grid gap-5 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl bg-card p-4 ring-1 ring-border">
            <Skeleton className="ms-auto h-3 w-32" />
            <Skeleton className="mt-3 h-6 w-36" />
            <Skeleton className="mt-3 h-10 w-28" />
            <div className="mt-4 rounded-lg bg-secondary p-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="mt-3 h-2 w-full rounded-full" />
              <Skeleton className="ms-auto mt-2 h-2.5 w-16" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
              <Skeleton className="h-7 rounded-lg" />
              <Skeleton className="h-7 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
