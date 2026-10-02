import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function SubscribersLoading() {
  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <div className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
          </Card>
        ))}
      </div>
      {/* Command bar */}
      <div className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-border lg:flex-row lg:items-center lg:justify-between">
        <Skeleton className="h-10 w-full max-w-xs rounded-lg" />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-[6px]" />
          ))}
        </div>
      </div>
      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="space-y-px">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
                <Skeleton className="hidden h-3 w-24 sm:block" />
                <Skeleton className="hidden h-3 w-20 md:block" />
                <Skeleton className="h-7 w-16 rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
