import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="grid h-[calc(100svh-8rem)] grid-cols-1 gap-4 md:grid-cols-[340px_1fr]">
      <Card className="flex flex-col overflow-hidden">
        <div className="p-3 border-b">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="p-2 space-y-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg p-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="flex flex-col overflow-hidden">
        <div className="p-3 border-b flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="flex-1 p-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
              <Skeleton className={`h-10 rounded-2xl ${i % 2 ? "w-52" : "w-64"}`} />
            </div>
          ))}
        </div>
        <div className="p-3 border-t">
          <Skeleton className="h-9 w-full" />
        </div>
      </Card>
    </div>
  );
}
