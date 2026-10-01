import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the rendered page: header card → 4 KPI cards → 2-col library grid
// with the 7-slot week strip.
export default function ProgramsLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header card */}
      <div className="rounded-xl bg-card p-5 ring-1 ring-border">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-3 h-8 w-72" />
        <Skeleton className="mt-2 h-4 w-[28rem] max-w-full" />
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl bg-card p-5 ring-1 ring-border">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-9 w-20" />
            <Skeleton className="mt-3 h-3 w-36" />
          </div>
        ))}
      </div>

      {/* Library cards with week strip */}
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="flex flex-1 flex-col gap-3">
              <div className="flex items-start gap-3">
                <Skeleton className="size-12 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1.5 pt-2">
                {[0, 1, 2, 3, 4, 5, 6].map((j) => (
                  <Skeleton key={j} className="h-[92px] rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
