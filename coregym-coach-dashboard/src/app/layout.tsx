import type { Metadata } from "next";
// UX-01: Plus Jakarta Sans and Instrument Serif were defined but their CSS
// variables were never referenced outside this file (verified by grep) —
// they still shipped on every route. Poppins (UI) + Cairo (Arabic) + Inter
// (landing nav) remain.
import { Poppins, Cairo, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { checkPublicEnv } from "@/lib/env-check";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CoreGym Coach Dashboard",
  description: "Coach dashboard for CoreGym — chat, subscribers, workouts, revenue",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // D2: loud server-side warning when public env is missing/placeholder.
  checkPublicEnv();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${poppins.variable} ${cairo.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
