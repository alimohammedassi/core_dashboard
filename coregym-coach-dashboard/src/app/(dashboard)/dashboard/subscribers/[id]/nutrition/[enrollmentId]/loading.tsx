import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 max-w-4xl">
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-28" />
      <Skeleton className="h-48" />
      <Skeleton className="h-64" />
    </div>
  );
}
