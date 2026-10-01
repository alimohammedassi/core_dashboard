import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function SubscriberProfileLoading() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-4 w-36" />
      {/* Hero */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-5 sm:gap-5">
          <Skeleton className="size-20 rounded-xl sm:size-24" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-8 w-48" />
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <Skeleton className="ms-auto hidden h-10 w-32 rounded-lg lg:block" />
        </CardContent>
      </Card>
      {/* AI analysis */}
      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-3 w-96 max-w-full" />
        </CardContent>
      </Card>
      {/* Telemetry tiles */}
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-2.5 rounded-full" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <div className="space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-1.5 w-full" />
              </div>
            </Card>
          ))}
        </div>
      </div>
      {/* Content cards */}
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="space-y-3 py-5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ))}
      {/* Charts */}
      <Card>
        <CardContent className="space-y-4 py-5">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
