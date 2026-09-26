"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Smartphone, UserPlus } from "lucide-react";
import { Counter, Glow, Kicker, Stagger, Item, useLanding } from "./ui";

/* ── How it works — ONE pinned, scroll-scrubbed moment (desktop) ─────────── */

function PinnedSteps() {
  const { t } = useLanding();
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setStep(Math.min(t.how.steps.length - 1, Math.max(0, Math.floor(v * t.how.steps.length))));
  });
  const lineScale = useTransform(scrollYProgress, [0.05, 0.92], [0, 1]);

  return (
    <div ref={trackRef} className="relative hidden h-[300vh] md:block">
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden px-6">
        {/* ghost step number crossfading behind the cards */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-end pe-[8%]">
          {t.how.steps.map((_, i) => (
            <motion.span
              key={i}
              initial={false}
              animate={{ opacity: i === step ? 1 : 0, y: i === step ? 0 : 40 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="absolute font-black leading-none tracking-tighter text-white/[0.045] text-[22rem]"
            >
              {String(i + 1).padStart(2, "0")}
            </motion.span>
          ))}
        </div>

        <div className="relative mx-auto w-full max-w-2xl text-center">
          <Kicker>{t.how.kicker}</Kicker>
          <h2 className="font-black tracking-[-0.025em] text-4xl sm:text-5xl">{t.how.title}</h2>
        </div>

        {/* scrubbed progress line */}
        <div className="relative mx-auto mt-12 w-full max-w-3xl">
          <div className="absolute -top-8 inset-x-0 h-px bg-white/[0.08]" />
          <motion.div
            style={{ scaleX: lineScale }}
            className="absolute -top-8 inset-x-0 h-px origin-left bg-gradient-to-r from-volt via-volt/70 to-teal rtl:origin-right"
          />

          {/* step indicator */}
          <div className="mb-8 flex items-center justify-center gap-6">
            {t.how.steps.map((_, i) => (
              <span
                key={i}
                className={`text-sm font-extrabold tabular-nums transition-colors duration-300 ${
                  i === step ? "text-volt" : "text-white/25"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
            ))}
          </div>

          {/* crossfading step cards */}
          <div className="relative h-[280px]">
            {t.how.steps.map((stepData, i) => (
              <motion.div
                key={i}
                initial={false}
                animate={{
                  opacity: i === step ? 1 : 0,
                  y: i === step ? 0 : i < step ? -24 : 24,
                  scale: i === step ? 1 : 0.97,
                }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className={`absolute inset-0 flex flex-col items-center justify-start text-center ${
                  i === step ? "" : "pointer-events-none"
                }`}
              >
                <div className="mb-6 flex size-16 items-center justify-center rounded-3xl border border-volt/25 bg-[#121310] text-2xl font-extrabold text-volt shadow-[0_0_40px_-8px_rgba(178,215,66,0.5)]">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="text-2xl font-bold">{stepData.title}</h3>
                <p className="mx-auto mt-3 max-w-xl leading-relaxed text-white/55">{stepData.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HowItWorks() {
  const { t } = useLanding();
  const reduced = useReducedMotion();

  return (
    <section id="how" className="relative scroll-mt-24">
      {/* depth glow behind the pinned moment */}
      <Glow className="left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2" />

      {/* desktop: pinned + scrubbed (skipped entirely for reduced motion) */}
      {!reduced && <PinnedSteps />}

      {/* mobile + reduced motion: classic stacked reveal */}
      <div className={`mx-auto max-w-6xl px-6 py-24 sm:py-32 ${reduced ? "" : "md:hidden"}`}>
        <div className="mx-auto max-w-2xl text-center">
          <Kicker>{t.how.kicker}</Kicker>
          <h2 className="font-black leading-[1.02] tracking-[-0.025em] text-3xl sm:text-5xl">{t.how.title}</h2>
        </div>

        <Stagger className="mt-14 grid gap-10 md:grid-cols-3 md:gap-6" gap={0.14}>
          {t.how.steps.map((stepData, i) => (
            <Item key={i}>
              <div className="relative text-center md:text-start">
                <div className="relative z-10 mx-auto mb-5 flex size-[4.5rem] items-center justify-center rounded-3xl border border-volt/25 bg-[#121310] text-2xl font-extrabold text-volt shadow-[0_0_30px_-6px_rgba(178,215,66,0.4)] md:mx-0">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="text-xl font-bold">{stepData.title}</h3>
                <p className="mt-2.5 leading-relaxed text-white/55">{stepData.body}</p>
              </div>
            </Item>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ── Animated stats ──────────────────────────────────────────────────────── */

export function Stats() {
  const { t } = useLanding();

  return (
    <section className="relative border-y border-white/[0.06] bg-white/[0.015]">
      <Glow className="left-[12%] top-[-40%] size-[340px]" color="gold" />
      <Stagger className="relative mx-auto grid max-w-6xl grid-cols-2 gap-y-10 px-6 py-14 sm:py-16 lg:grid-cols-4" gap={0.1}>
        {t.stats.map((stat, i) => (
          <Item key={i} className="text-center">
            <p className="text-4xl font-black tracking-tight text-volt sm:text-5xl">
              <Counter value={stat.value} suffix={stat.suffix} />
            </p>
            <p className="mx-auto mt-2 max-w-[180px] text-sm font-light leading-snug text-white/50">{stat.label}</p>
          </Item>
        ))}
      </Stagger>
    </section>
  );
}

/* ── Final CTA ───────────────────────────────────────────────────────────── */

export function FinalCta() {
  const { t } = useLanding();

  return (
    <section className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <Item y={36}>
        <div className="relative overflow-hidden rounded-[2.5rem] border border-volt/20 bg-gradient-to-b from-volt/[0.09] to-transparent px-6 py-16 text-center sm:px-12 sm:py-20">
          <Glow className="left-1/2 top-[-30%] size-[420px] -translate-x-1/2" />
          <Glow className="bottom-[-40%] right-[-5%] size-[280px]" color="gold" />

          <h2 className="relative font-black tracking-[-0.03em] text-4xl sm:text-5xl">{t.cta.title}</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-base font-light text-white/60 sm:text-lg">{t.cta.sub}</p>

          <div className="relative mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#app"
              className="flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-7 py-3.5 text-sm font-bold text-white transition-all hover:border-volt/40 hover:text-volt active:scale-[0.97] sm:w-auto"
            >
              <Smartphone className="size-4" />
              {t.cta.app}
            </a>
            <Link
              href="/signup"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-volt px-7 py-3.5 text-sm font-bold text-[#161806] shadow-[0_0_40px_-8px_rgba(178,215,66,0.5)] transition-all hover:scale-[1.03] hover:shadow-[0_0_64px_-6px_rgba(178,215,66,0.7)] active:scale-[0.97] sm:w-auto"
            >
              <UserPlus className="size-4" />
              {t.cta.coach}
            </Link>
          </div>

          <div className="relative mt-6 flex flex-col items-center gap-1 text-xs text-white/40 sm:flex-row sm:justify-center sm:gap-8">
            <span>{t.cta.appNote}</span>
            <span>{t.cta.coachNote}</span>
          </div>
        </div>
      </Item>
    </section>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────────── */

export function Footer() {
  const { t } = useLanding();

  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 px-6 py-12 sm:flex-row">
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <Image src="/landing/logo.png" alt="CoreGym" width={980} height={280} className="h-6 w-auto" />
          <p className="max-w-xs text-center text-xs text-white/40 sm:text-start">{t.footer.tagline}</p>
        </div>

        <div className="flex flex-col items-center gap-2 text-sm sm:items-end">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-white/35">{t.footer.product}</p>
          <Link href="/login" className="text-white/60 transition-colors hover:text-volt">
            {t.footer.coachLogin}
          </Link>
          <Link href="/signup" className="text-white/60 transition-colors hover:text-volt">
            {t.footer.coachSignup}
          </Link>
          <div className="mt-2 flex gap-4 text-xs text-white/40">
            <Link href="/privacy" className="transition-colors hover:text-volt">
              {t.footer.privacy}
            </Link>
            <Link href="/terms" className="transition-colors hover:text-volt">
              {t.footer.terms}
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.06] py-5 text-center text-xs text-white/30">
        © {new Date().getFullYear()} {t.footer.rights}
      </div>
    </footer>
  );
}
