import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlansLoading() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-6">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
