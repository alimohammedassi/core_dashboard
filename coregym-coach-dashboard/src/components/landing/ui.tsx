"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { landing, type Lang } from "./i18n";

/* ── Language context ────────────────────────────────────────────────────── */

type LandingContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (typeof landing)[Lang];
};

const LandingContext = createContext<LandingContextValue | null>(null);

export function useLanding() {
  const ctx = useContext(LandingContext);
  if (!ctx) throw new Error("useLanding must be used inside <LandingProvider>");
  return ctx;
}

/* The persisted language is an external store (localStorage) — read through
   useSyncExternalStore so SSR/hydration stay on "en" without a setState-in-effect. */

const LANG_KEY = "coregym-landing-lang";
const langListeners = new Set<() => void>();

function subscribeLang(callback: () => void) {
  langListeners.add(callback);
  return () => langListeners.delete(callback);
}

function getLangSnapshot(): Lang {
  return window.localStorage.getItem(LANG_KEY) === "ar" ? "ar" : "en";
}

function getLangServerSnapshot(): Lang {
  return "en";
}

export function LandingProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLangSnapshot, getLangServerSnapshot);

  const setLang = (next: Lang) => {
    window.localStorage.setItem(LANG_KEY, next);
    langListeners.forEach((notify) => notify());
  };

  return (
    <LandingContext.Provider value={{ lang, setLang, t: landing[lang] }}>
      {children}
    </LandingContext.Provider>
  );
}

/* ── Scroll reveal wrapper ───────────────────────────────────────────────── */

export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ── Card with a glow that follows the cursor ─────────────────────────────── */

export function GlowCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        ref.current?.style.setProperty("--mx", `${e.clientX - rect.left}px`);
        ref.current?.style.setProperty("--my", `${e.clientY - rect.top}px`);
      }}
      className={`group relative overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.02] transition-colors duration-300 hover:border-volt/25 ${className ?? ""}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(520px circle at var(--mx, 50%) var(--my, 50%), rgba(178, 215, 66, 0.07), transparent 45%)",
        }}
      />
      {children}
    </div>
  );
}

/* ── Animated counter ────────────────────────────────────────────────────── */

export function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!inView) return;
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = `${value}${suffix}`;
      return;
    }
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (el) el.textContent = `${Math.round(v)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, value, suffix, reduced]);

  return (
    <span ref={ref} className="tabular-nums">
      0{suffix}
    </span>
  );
}

/* ── Section kicker (small volt label above headings) ────────────────────── */

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-volt/25 bg-volt/[0.08] px-3.5 py-1 text-xs font-bold tracking-wide text-volt">
      <span className="size-1.5 rounded-full bg-volt" />
      {children}
    </p>
  );
}

/* ── Volt accent inside a headline: wrap the accent word(s) with *…* ──────── */

export function AccentText({ text }: { text: string }) {
  return (
    <>
      {text.split("*").map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="text-volt">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/* ── Staggered reveal: parent orchestrates, children rise one by one ─────── */

export function Stagger({ children, className, gap = 0.09 }: { children: ReactNode; className?: string; gap?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function Item({ children, className, y = 24 }: { children: ReactNode; className?: string; y?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}

/* ── Film grain over the whole page so black never reads flat ────────────── */

export function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[80] opacity-[0.028]"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
        backgroundSize: "160px 160px",
      }}
    />
  );
}

/* ── Off-center radial glow used as section backdrop depth ───────────────── */

export function Glow({
  className,
  color = "volt",
}: {
  className?: string;
  color?: "volt" | "gold" | "teal";
}) {
  const rgb = color === "gold" ? "232, 196, 104" : color === "teal" ? "79, 209, 197" : "178, 215, 66";
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute rounded-full blur-[120px] ${className ?? ""}`}
      style={{ background: `rgba(${rgb}, 0.09)` }}
    />
  );
}
