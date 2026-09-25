"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { AccentText, Glow, Kicker, Reveal, Stagger, Item, useLanding } from "./ui";

/* ── Mini dashboard mockup, built in pure markup ─────────────────────────── */

const CHART_BARS = [42, 68, 55, 80, 62, 95, 74];
const CHART_COLORS = ["bg-volt", "bg-volt", "bg-teal", "bg-volt", "bg-gold", "bg-volt", "bg-teal"];
const CLIENT_ROWS = [
  { name: "Sara M.", pct: "82%", w: "82%", color: "bg-volt", initial: "S" },
  { name: "Omar K.", pct: "64%", w: "64%", color: "bg-teal", initial: "O" },
  { name: "Nour A.", pct: "91%", w: "91%", color: "bg-gold", initial: "N" },
];

function DashboardMockup() {
  const reduced = useReducedMotion();
  const bar = (i: number) =>
    reduced
      ? { style: { height: `${CHART_BARS[i]}%` } }
      : {
          initial: { scaleY: 0 },
          whileInView: { scaleY: 1 },
          viewport: { once: true },
          transition: { duration: 0.7, delay: 0.3 + i * 0.07, ease: [0.16, 1, 0.3, 1] as const },
          style: { height: `${CHART_BARS[i]}%`, transformOrigin: "bottom" },
        };

  const line = (i: number) =>
    reduced
      ? {}
      : {
          initial: { scaleX: 0 },
          whileInView: { scaleX: 1 },
          viewport: { once: true },
          transition: { duration: 0.9, delay: 0.5 + i * 0.15, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121310] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)]">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-3">
        <span className="size-2.5 rounded-full bg-[#ee7f60]/70" />
        <span className="size-2.5 rounded-full bg-[#e8c468]/70" />
        <span className="size-2.5 rounded-full bg-[#36b37e]/70" />
        <span className="ms-3 rounded-md bg-white/[0.05] px-2.5 py-0.5 text-[10px] text-white/40">
          coregym.app/dashboard
        </span>
      </div>

      <div className="flex">
        {/* sidebar */}
        <div className="hidden w-32 shrink-0 flex-col gap-1 border-e border-white/[0.06] p-3 sm:flex">
          <div className="mb-2 flex items-center gap-1.5 px-2">
            <span className="size-4 rounded-md bg-volt" />
            <span className="h-2 w-14 rounded-full bg-white/15" />
          </div>
          {["Overview", "Subscribers", "Nutrition", "Chat", "Revenue"].map((item, i) => (
            <div
              key={item}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${i === 2 ? "bg-volt/10" : ""}`}
            >
              <span className={`size-1.5 rounded-full ${i === 2 ? "bg-volt" : "bg-white/20"}`} />
              <span className={`text-[10px] font-semibold ${i === 2 ? "text-volt" : "text-white/40"}`}>{item}</span>
            </div>
          ))}
        </div>

        {/* main */}
        <div className="flex-1 space-y-3 p-4">
          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Active clients", value: "24", color: "text-volt" },
              { label: "This month", value: "$4,820", color: "text-teal" },
              { label: "Adherence", value: "87%", color: "text-gold" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-white/35">{kpi.label}</p>
                <p className={`mt-1 text-sm font-extrabold sm:text-lg ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* chart */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wide text-white/35">Weekly volume</span>
              <span className="rounded-md bg-volt/10 px-1.5 py-0.5 text-[9px] font-bold text-volt">+12%</span>
            </div>
            <div className="flex h-20 items-end gap-1.5 sm:h-24">
              {CHART_BARS.map((h, i) => (
                <motion.div key={i} {...bar(i)} className={`flex-1 rounded-t-md ${CHART_COLORS[i]} opacity-80`} />
              ))}
            </div>
          </div>

          {/* client rows — progress lines fill from the inline start */}
          <div className="space-y-1.5">
            {CLIENT_ROWS.map((row, i) => (
              <div
                key={row.name}
                className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/70">
                  {row.initial}
                </span>
                <span className="w-14 shrink-0 text-[10px] font-bold text-white/75">{row.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <motion.div
                    {...line(i)}
                    className={`h-full w-full origin-left rounded-full rtl:origin-right ${row.color} opacity-80`}
                    style={{ width: row.w }}
                  />
                </div>
                <span className="text-[10px] font-bold text-white/50">{row.pct}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Coach section — the mockup bleeds past the column toward the edge ───── */

export function CoachSection() {
  const { t } = useLanding();

  return (
    <section
      id="coaches"
      className="relative scroll-mt-24 overflow-x-clip border-y border-white/[0.06] bg-white/[0.015] py-24 sm:py-32"
    >
      {/* depth glows, off-center */}
      <Glow className="end-[-6%] top-[-4%] size-[420px]" color="gold" />
      <Glow className="start-[-8%] bottom-[8%] size-[360px]" />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Item y={36}>
            <div className="lg:-ms-[9%] lg:w-[109%]">
              <DashboardMockup />
            </div>
          </Item>

          <div>
            <Reveal>
              <Kicker>{t.coach.kicker}</Kicker>
              <h2 className="font-black leading-[1.02] tracking-[-0.025em] text-3xl sm:text-5xl">
                <AccentText text={t.coach.title} />
              </h2>
              <p className="mt-4 text-base font-light text-white/60 sm:text-lg">{t.coach.sub}</p>
            </Reveal>

            <Stagger className="mt-8 space-y-3.5" gap={0.07}>
              {t.coach.features.map((feature, i) => (
                <Item key={i} y={14}>
                  <div className="flex items-start gap-3 text-sm text-white/75 sm:text-[15px]">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-volt/15 text-volt">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {feature}
                  </div>
                </Item>
              ))}
            </Stagger>

            <Item y={16}>
              <a
                href="/signup"
                className="mt-9 inline-flex items-center justify-center rounded-full bg-volt px-7 py-3.5 text-sm font-bold text-[#161806] shadow-[0_0_40px_-8px_rgba(178,215,66,0.5)] transition-all hover:scale-[1.03] hover:shadow-[0_0_64px_-6px_rgba(178,215,66,0.7)] active:scale-[0.97]"
              >
                {t.coach.cta}
              </a>
            </Item>
          </div>
        </div>
      </div>
    </section>
  );
}
