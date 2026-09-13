import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function EnrollmentProgressLoading() {
  return (
    <div className="space-y-6 max-w-4xl">
      <Skeleton className="h-4 w-48" />
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-80" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
