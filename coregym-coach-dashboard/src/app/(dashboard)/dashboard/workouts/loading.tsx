import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the Workouts page rhythm: kicker + header, filter toolbar card,
// 2-col template grid, footer pager strip.
export default function WorkoutsLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-5 w-28 rounded-[6px]" />
          <Skeleton className="size-1.5 rounded-full" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-8 w-56 lg:h-10 lg:w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="flex flex-col gap-3 rounded-xl bg-card p-2 md:flex-row md:items-center md:justify-between">
        <Skeleton className="h-9 w-full max-w-xl" />
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-[6px]" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl bg-card px-5 py-4">
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-[6px]" />
              <Skeleton className="h-5 w-16 rounded-[6px]" />
            </div>
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="mt-auto h-4 w-40" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
