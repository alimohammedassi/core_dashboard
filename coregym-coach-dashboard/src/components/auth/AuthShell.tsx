"use client";

/* Shared authentication environment: the landing page's dark cinematic canvas
   (#0a0b08 + film grain + volt ambient glows) wrapped around a centered auth
   panel. Login, signup, forgot- and reset-password all render inside it so the
   whole auth flow reads as one CoreGym "secure access" system. Copy comes from
   the auth i18n domain; pages own everything inside the panel. */

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Grain, Glow } from "@/components/landing/ui";
import { useI18n } from "@/lib/i18n/client";

export function AuthShell({ children, size = "sm" }: { children: ReactNode; size?: "sm" | "md" }) {
  const reduced = useReducedMotion();
  const { t, lang } = useI18n();
  const isEn = lang === "en";
  const microLabel = isEn
    ? "text-[10px] font-bold uppercase tracking-[0.14em]"
    : "text-[11px] font-bold";

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-[#0a0b08] px-4 py-10 text-[#eceee2] sm:px-6">
      {/* Single slow ambient drift on one glow — disabled for reduced motion. */}
      <style>{`@media (prefers-reduced-motion: no-preference){@keyframes auth-ambient-drift{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(5%,-4%,0) scale(1.1)}}.auth-ambient-drift{animation:auth-ambient-drift 12s ease-in-out infinite alternate}}`}</style>

      {/* Ambient atmosphere: radial wash, two glows, desktop hairline grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(90%_65%_at_50%_0%,rgba(178,215,66,0.07),transparent_60%)]" />
        <Glow className="auth-ambient-drift start-[-8%] top-[-12%] size-[420px]" />
        <Glow color="teal" className="end-[-10%] bottom-[-16%] size-[360px] opacity-70" />
        <div className="absolute inset-y-0 start-1/4 hidden w-px bg-white/[0.05] lg:block" />
        <div className="absolute inset-y-0 start-2/4 hidden w-px bg-white/[0.05] lg:block" />
        <div className="absolute inset-y-0 start-3/4 hidden w-px bg-white/[0.05] lg:block" />
      </div>
      <Grain />

      <motion.div
        initial={reduced ? false : { opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex w-full flex-col items-center"
      >
        <Link
          href="/"
          aria-label="CoreGym"
          className="mb-8 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0a0b08]"
        >
          <Image
            src="/landing/logo.png"
            alt=""
            width={980}
            height={280}
            priority
            className="h-6 w-auto"
          />
        </Link>

        <main className={`w-full ${size === "md" ? "max-w-[440px]" : "max-w-[400px]"}`}>
          <div className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[#121310]/90 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            {/* faint volt top-edge accent */}
            <div
              aria-hidden
              className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-volt/50 to-transparent"
            />
            <div className="relative p-6 sm:p-8">
              <div className="mb-7 flex items-center justify-between gap-3">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border border-volt/25 bg-volt/[0.08] px-3 py-1 text-volt ${microLabel}`}
                >
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-volt" />
                  </span>
                  {t("auth.shell.secureAccess")}
                </span>
                <span className={`${microLabel} text-white/35`}>{t("auth.shell.coachPortal")}</span>
              </div>
              {children}
            </div>
          </div>
        </main>
      </motion.div>
    </div>
  );
}
