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
import { I18nProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/i18n/server";
import { dirFor } from "@/lib/i18n/config";

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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // D2: loud server-side warning when public env is missing/placeholder.
  checkPublicEnv();
  // Language comes from a cookie so SERVER components render localized content
  // and <html lang/dir> is correct on first paint (no RTL flash).
  const lang = await getLang();
  return (
    <html
      lang={lang}
      dir={dirFor(lang)}
      suppressHydrationWarning
      className={`${poppins.variable} ${cairo.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider lang={lang}>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
            {children}
            <Toaster richColors />
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
