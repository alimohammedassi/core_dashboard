import { Skeleton } from "@/components/ui/skeleton";

/* Skeleton matching the chat frame: one rounded ring, roster aside
   (bg-card) + thread pane (bg-background) with squircle avatars and
   volt/graphite bubble placeholders. */
export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100svh-7.75rem)] min-h-80 overflow-hidden rounded-xl ring-1 ring-border">
      {/* Roster */}
      <aside className="flex w-full shrink-0 flex-col bg-card md:w-80 lg:w-[340px]">
        <div className="flex flex-col gap-2.5 px-3 py-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-10 rounded-full" />
            <Skeleton className="ms-auto size-8 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <div className="space-y-1 p-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-lg p-2.5">
              <Skeleton className="size-11 rounded-lg" />
              <div className="flex-1 space-y-1.5 pt-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </div>
      </aside>
      {/* Thread */}
      <section className="hidden min-w-0 flex-1 flex-col bg-background md:flex">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border/60 px-4">
          <Skeleton className="size-10 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="flex-1 space-y-4 px-5 py-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
              <Skeleton
                className={`h-11 rounded-2xl ${i % 2 ? "w-52 bg-primary" : "w-64 bg-secondary"}`}
              />
            </div>
          ))}
        </div>
        <div className="border-t p-3">
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </section>
    </div>
  );
}
