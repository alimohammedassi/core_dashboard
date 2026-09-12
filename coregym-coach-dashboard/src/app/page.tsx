import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/20 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>CoreGym Coach Dashboard</CardTitle>
          <CardDescription>
            Scaffolded with Next.js + Tailwind + shadcn/ui + Supabase + Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Link href="/login">
            <Button>Coach Login</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline">Dashboard (protected)</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
