"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { ArrowRight, Menu, X } from "lucide-react";
import { HeroBackdrop } from "./HeroBackdrop";
import { useLanding } from "./ui";

/* ── Language toggle ─────────────────────────────────────────────────────── */

function LangToggle() {
  const { lang, setLang } = useLanding();
  return (
    <div className="relative flex items-center rounded-full border border-white/10 bg-white/[0.06] p-1 text-xs font-bold">
      {(["en", "ar"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`relative rounded-full px-3 py-1.5 transition-colors ${lang === l ? "text-[#161806]" : "text-white/60 hover:text-white"
            }`}
          aria-label={l === "en" ? "Switch to English" : "التبديل للعربية"}
        >
          {lang === l && (
            <motion.span
              layoutId="lang-pill"
              className="absolute inset-0 rounded-full bg-volt"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <span className="relative z-10">{l === "en" ? "EN" : "ع"}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Navbar + full-screen mobile menu ────────────────────────────────────── */

export function Navbar() {
  const { t } = useLanding();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));

  const setMenu = (open: boolean) => {
    setMenuOpen(open);
    document.body.style.overflow = open ? "hidden" : "";
  };

  useEffect(() => () => { document.body.style.overflow = ""; }, []);

  const navLinks = (
    <>
      <a href="#app" className="transition-colors hover:text-volt">
        {t.nav.features}
      </a>
      <a href="#coaches" className="transition-colors hover:text-volt">
        {t.nav.coaches}
      </a>
      <a href="#how" className="transition-colors hover:text-volt">
        {t.nav.how}
      </a>
    </>
  );

  return (
    <>
      <motion.header
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled
            ? "border-b border-white/[0.06] bg-[#0a0b08]/80 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
          }`}
      >
        <div
          className={`mx-auto flex max-w-6xl items-center justify-between px-6 transition-all duration-300 ${scrolled ? "h-12" : "h-16"
            }`}
        >
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/landing/logo.png"
              alt="CoreGym"
              width={980}
              height={280}
              className={`w-auto transition-all duration-300 ${scrolled ? "h-5" : "h-7"}`}
              priority
            />
          </Link>

          <nav className="hidden items-center gap-8 font-[family-name:var(--font-inter)] text-base uppercase tracking-wide text-white/80 md:flex">
            {navLinks}
          </nav>

          <div className="flex items-center gap-3">
            <LangToggle />
            <Link
              href="/login"
              className="hidden rounded-full bg-volt px-4 py-2 text-sm font-bold text-[#161806] transition-all hover:scale-[1.03] hover:shadow-[0_0_32px_-8px_rgba(178,215,66,0.7)] active:scale-[0.97] sm:block"
            >
              {t.nav.login}
            </Link>
            <button
              onClick={() => setMenu(true)}
              aria-label="Open menu"
              className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition-colors hover:border-volt/40 hover:text-volt md:hidden"
            >
              <Menu className="size-5" />
            </button>
          </div>
        </div>
      </motion.header>

      {/* full-screen mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[90] flex flex-col bg-[#0a0b08]/95 backdrop-blur-2xl md:hidden"
          >
            <div className="flex h-16 items-center justify-between px-6">
              <Image src="/landing/logo.png" alt="CoreGym" width={980} height={280} className="h-7 w-auto" />
              <button
                onClick={() => setMenu(false)}
                aria-label="Close menu"
                className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            <nav className="flex flex-1 flex-col items-start justify-center gap-7 px-8 font-[family-name:var(--font-inter)] text-3xl font-extrabold uppercase tracking-tight text-white">
              {[
                { href: "#app", label: t.nav.features },
                { href: "#coaches", label: t.nav.coaches },
                { href: "#how", label: t.nav.how },
              ].map((link, i) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenu(false)}
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="transition-colors hover:text-volt"
                >
                  {link.label}
                </motion.a>
              ))}
            </nav>

            <div className="flex items-center gap-3 px-8 pb-12">
              <Link
                href="/login"
                onClick={() => setMenu(false)}
                className="flex-1 rounded-full bg-volt px-6 py-3.5 text-center text-sm font-bold uppercase tracking-wide text-[#161806]"
              >
                {t.nav.login}
              </Link>
              <LangToggle />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ── Hero visual: the app motion film — scroll expand + mouse tilt ───────── */

function HeroShowcase() {
  const reduced = useReducedMotion();
  const { t } = useLanding();
  const ref = useRef<HTMLDivElement>(null);

  // the film grows from an inset card to (near) full width as it enters
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.28"] });
  const expand = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });
  const scale = useTransform(expand, [0, 1], [0.85, 1]);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [4, -4]), { stiffness: 60, damping: 18 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-5, 5]), { stiffness: 60, damping: 18 });

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const resetTilt = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <div
      ref={ref}
      onMouseMove={reduced ? undefined : onMouseMove}
      onMouseLeave={reduced ? undefined : resetTilt}
      className="relative mx-auto mt-16 w-full max-w-5xl [perspective:1400px]"
    >
      <motion.div style={{ scale, rotateX, rotateY, transformStyle: "preserve-3d" }} className="relative">
        {/* volt ambient glow behind the card */}
        <div
          aria-hidden
          className="absolute -inset-x-10 top-10 -bottom-8 -z-10 rounded-[4rem] bg-[radial-gradient(55%_60%_at_50%_40%,rgba(178,215,66,0.16),transparent_72%)] blur-2xl"
        />

        {/* the film — white studio card */}
        <div className="relative overflow-hidden rounded-[2rem] bg-white shadow-[0_60px_120px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/25">
          <video
            className="block h-auto w-full"
            src="/landing/Fintech mobile app-1789828752370.mp4"
            poster="/landing/app-motion-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="CoreGym app in motion"
          />
          <div className="pointer-events-none absolute inset-0 rounded-[2rem] ring-1 ring-inset ring-black/[0.08]" />

          {/* watermark cover: the stock clip ships a corner mark — hide it
              behind a bottom scrim + frosted CoreGym chip (mirrors the live
              caption chip on the opposite corner so it reads as intentional) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 via-black/10 to-transparent"
          />

          {/* live caption chip */}
          <div className="absolute bottom-4 start-4 flex items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/90 backdrop-blur-md">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-volt" />
            </span>
            {t.hero.motion}
          </div>

          {/* covers the stock clip's bottom-right watermark */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-black/70 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/90 backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-volt" />
            CoreGym
          </div>
        </div>

        {/* floor glow */}
        <div aria-hidden className="absolute inset-x-16 -bottom-8 h-12 rounded-full bg-volt/15 blur-2xl" />
      </motion.div>
    </div>
  );
}

/* ── Hero section ────────────────────────────────────────────────────────── */

export function Hero() {
  const { t, lang } = useLanding();
  const reduced = useReducedMotion();
  const enBody = lang === "en" ? "font-[family-name:var(--font-inter)]" : "";

  const enter = (delay: number) =>
    reduced
      ? {}
      : {
        initial: { opacity: 0, y: 26 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <section className="relative overflow-hidden px-6 pb-10 pt-32 sm:pt-36">
      <HeroBackdrop />

      <div className="relative z-20 mx-auto max-w-4xl text-center">
        <motion.p
          {...enter(0.15)}
          className={`mb-5 text-[11px] font-bold uppercase tracking-[0.18em] text-volt ${enBody}`}
        >
          {t.hero.badge}
        </motion.p>

        <motion.h1
          {...enter(0.25)}
          className={
            lang === "en"
              ? `font-extrabold uppercase leading-[0.98] tracking-[-0.02em] text-[40px] sm:text-[56px] md:text-[72px] ${enBody}`
              : "text-[34px] font-bold leading-[1.12] sm:text-[48px] md:text-[64px]"
          }
        >
          {t.hero.title1} {t.hero.title2} {t.hero.title3}
          <span className="text-volt">.</span>
        </motion.h1>

        <motion.p
          {...enter(0.35)}
          className={`mx-auto mt-6 max-w-[512px] text-[14px] leading-relaxed text-white/70 sm:text-base ${enBody}`}
        >
          {t.hero.sub}
        </motion.p>

        <motion.div {...enter(0.45)} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="group flex w-full items-center justify-center gap-2 rounded-full bg-volt px-7 py-3.5 text-[13px] font-bold uppercase tracking-wide text-[#161806] shadow-[0_0_40px_-8px_rgba(178,215,66,0.5)] transition-all hover:scale-[1.03] hover:shadow-[0_0_64px_-6px_rgba(178,215,66,0.7)] active:scale-[0.97] sm:w-auto"
          >
            {t.hero.ctaCoach}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </Link>
          <a
            href="#app"
            className={`flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-7 py-3.5 text-[13px] font-bold uppercase tracking-wide text-white transition-all hover:border-volt/40 hover:text-volt active:scale-[0.97] sm:w-auto ${enBody}`}
          >
            {t.hero.ctaApp}
          </a>
        </motion.div>

        <motion.p {...enter(0.55)} className="mt-5 text-xs text-white/40">
          {t.hero.note}
        </motion.p>
      </div>

      <div className="relative z-10">
        <HeroShowcase />
      </div>
    </section>
  );
}

/* ── Feature marquee — continuous loop, pauses on hover ──────────────────── */

export function Marquee() {
  const { t, lang } = useLanding();
  const items = [...t.marquee, ...t.marquee];
  const reduced = useReducedMotion();

  return (
    <div className="relative border-y border-white/[0.06] bg-white/[0.015] py-5">
      <style>{`@keyframes landing-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <div
          dir="ltr"
          className="flex w-max items-center gap-8 pe-8 hover:[animation-play-state:paused]"
          style={reduced ? undefined : { animation: "landing-marquee 38s linear infinite" }}
        >
          {items.map((item, i) => (
            <span
              key={`${lang}-${i}`}
              className="flex items-center gap-8 whitespace-nowrap text-sm font-bold uppercase tracking-[0.18em] text-white/35"
            >
              {item}
              <span className="size-1.5 rounded-full bg-volt/50" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
