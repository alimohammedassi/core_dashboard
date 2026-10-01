import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the SettingsShell layout: header, boxed rail, stacked cards. */
export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Rail */}
        <div className="min-w-0 lg:col-span-3 lg:self-start">
          <div className="space-y-2 rounded-xl bg-sidebar p-2">
            {["h-5 w-24", "h-9 w-full", "h-9 w-full", "h-9 w-full", "h-9 w-full"].map((c, i) => (
              <Skeleton key={i} className={`rounded-lg ${c}`} />
            ))}
          </div>
        </div>
        {/* Stacked section cards */}
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-9">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="[--card-spacing:--spacing(5)]">
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
