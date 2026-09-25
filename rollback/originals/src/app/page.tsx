import Link from "next/link";
import { redirect } from "next/navigation";
import { Dumbbell, MessageSquare, ClipboardList, TrendingUp, Users, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Workout templates & assignments",
    description:
      "Build reusable workout templates with sets, reps and target weights. Assign them to any active client for any date.",
  },
  {
    icon: Users,
    title: "Weekly programs",
    description:
      "Group templates into a weekly schedule and enroll clients for multi-week blocks — every workout generated automatically.",
  },
  {
    icon: TrendingUp,
    title: "Performance review",
    description:
      "See exactly what each client lifted, set by set. Compare target vs actual, track volume trends and personal records.",
  },
  {
    icon: MessageSquare,
    title: "Chat & feedback",
    description:
      "Talk to your clients in realtime — text, images, voice notes and files. Send feedback right after reviewing a workout.",
  },
];

export default async function HomePage() {
  // Authenticated coaches land straight in the dashboard
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Dumbbell className="size-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">CoreGym</span>
          <span className="text-xs text-muted-foreground">Coach</span>
        </div>
        <Button render={<Link href="/login" />}>Coach login</Button>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-14 text-center sm:pt-20">
        <p className="mb-4 inline-block rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-bold uppercase tracking-wide text-primary">
          For CoreGym coaches
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          Coach your clients.
          <span className="text-primary"> We track the rest.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Build workout templates, schedule weekly programs, review every set your clients lift and give feedback —
          all in one dashboard, connected live to the CoreGym app.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button render={<Link href="/login" />} size="lg" className="w-full sm:w-auto">
            Coach login <ArrowRight className="ml-1 size-4" />
          </Button>
          <Button render={<Link href="/signup" />} variant="outline" size="lg" className="w-full sm:w-auto">
            New coach? Create an account
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Clients train in the CoreGym mobile app — everything they do shows up here automatically.
        </p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
              <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </span>
              <h2 className="mb-1.5 text-base font-bold">{f.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        CoreGym Coach Dashboard · The coach prescribes. The client performs. The data connects.
      </footer>
    </div>
  );
}
