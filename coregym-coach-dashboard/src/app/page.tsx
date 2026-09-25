import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "CoreGym — Coach dashboard + client app",
  description:
    "CoreGym pairs a powerful coach dashboard with a client app on one live database. Workouts, nutrition, chat and revenue — one ecosystem for your gym.",
};

export default async function HomePage() {
  // Authenticated coaches land straight in the dashboard
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return <Landing />;
}
