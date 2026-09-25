"use client";

import Image from "next/image";
import { BarChart3, Camera, Flame, Mic, ScanBarcode, Sparkles, Trophy, UserCheck } from "lucide-react";
import { AccentText, Glow, Kicker, Stagger, Item, useLanding } from "./ui";

export function AppSection() {
  const { t } = useLanding();

  return (
    <section id="app" className="relative mx-auto max-w-6xl scroll-mt-24 px-6 py-24 sm:py-32">
      {/* off-center depth glows */}
      <Glow className="right-[-8%] top-[6%] size-[380px]" />
      <Glow className="left-[-10%] bottom-[18%] size-[300px]" color="teal" />

      <div className="relative mx-auto max-w-2xl text-center">
        <Kicker>{t.app.kicker}</Kicker>
        <h2 className="font-black leading-[1.02] tracking-[-0.025em] text-3xl sm:text-5xl">
          <AccentText text={t.app.title} />
        </h2>
        <p className="mt-4 text-base font-light text-white/60 sm:text-lg">{t.app.sub}</p>
      </div>

      <Stagger className="relative mt-14 grid gap-4 lg:grid-cols-3" gap={0.11}>
        {/* Log a meal — the flagship card, oversized radius + padding */}
        <Item className="lg:col-span-2">
          <div className="flex h-full flex-col gap-6 rounded-[2.5rem] border border-volt/20 bg-volt/[0.04] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-volt/35 hover:shadow-[0_24px_70px_-24px_rgba(178,215,66,0.45)] sm:flex-row sm:items-center sm:p-10">
            <div className="flex-1">
              <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-volt text-[#161806] shadow-[0_0_30px_-6px_rgba(178,215,66,0.6)]">
                <Camera className="size-5" />
              </span>
              <h3 className="text-2xl font-bold tracking-tight sm:text-[1.7rem]">{t.app.features[0].title}</h3>
              <p className="mt-3 leading-relaxed text-white/55">{t.app.features[0].body}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  { icon: Camera, label: "AI Scan" },
                  { icon: Sparkles, label: "Suggest" },
                  { icon: Mic, label: "Voice" },
                  { icon: ScanBarcode, label: "Barcode" },
                ].map((chip) => (
                  <span
                    key={chip.label}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70"
                  >
                    <chip.icon className="size-3.5 text-volt" />
                    {chip.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[260px] shrink-0 sm:max-w-[280px]">
              <div
                aria-hidden
                className="absolute -inset-8 rounded-[3rem] bg-[radial-gradient(60%_55%_at_50%_45%,rgba(178,215,66,0.20),transparent_70%)] blur-2xl"
              />
              <div className="relative aspect-[1126/1750] w-full overflow-hidden rounded-[2rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.85)]">
                <Image
                  src="/landing/تصميم بدون عنوان (3).png"
                  alt="Six ways to log food in CoreGym — AI scan, suggest, voice, text, barcode"
                  fill
                  sizes="280px"
                  className="object-cover object-bottom"
                />
              </div>
            </div>
          </div>
        </Item>

        {/* Consistency — compact card, tighter radius for contrast */}
        <Item>
          <div className="group relative h-full overflow-hidden rounded-[1.4rem] border border-white/[0.07] bg-white/[0.02] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-gold/30 hover:shadow-[0_24px_70px_-24px_rgba(232,196,104,0.4)] sm:p-8">
            <span className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-gold/10 text-gold">
              <Flame className="size-5" />
            </span>
            <h3 className="text-xl font-bold">{t.app.features[3].title}</h3>
            <p className="mt-3 leading-relaxed text-white/55">{t.app.features[3].body}</p>
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                <Flame className="size-4 text-gold" />
                <span className="text-sm font-semibold text-white/80">21-day streak</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                <Trophy className="size-4 text-volt" />
                <span className="text-sm font-semibold text-white/80">#3 this week</span>
              </div>
            </div>
          </div>
        </Item>

        {/* AI knows your kitchen — wide card, suggest-a-meal device render */}
        <Item className="lg:col-span-2">
          <div className="group relative h-full overflow-hidden rounded-[1.4rem] border border-white/[0.07] bg-white/[0.02] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-teal/30 hover:shadow-[0_24px_70px_-24px_rgba(79,209,197,0.4)] sm:p-9">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
              <div className="flex-1">
                <span className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-teal/10 text-teal">
                  <Sparkles className="size-5" />
                </span>
                <h3 className="text-xl font-bold sm:text-2xl">{t.app.features[1].title}</h3>
                <p className="mt-3 leading-relaxed text-white/55">{t.app.features[1].body}</p>
              </div>
              <div className="relative mx-auto h-[380px] w-full max-w-[260px] shrink-0 sm:h-[420px]">
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-[3rem] bg-[radial-gradient(60%_55%_at_50%_45%,rgba(79,209,197,0.20),transparent_70%)] blur-2xl"
                />
                <Image
                  src="/landing/2.png"
                  alt="AI-suggested Egyptian dinner with 96% macro match"
                  fill
                  sizes="260px"
                  className="object-contain drop-shadow-[0_40px_80px_rgba(0,0,0,0.85)]"
                />
              </div>
            </div>
          </div>
        </Item>

        {/* Whole day at a glance — nutrition history device render */}
        <Item>
          <div className="group relative h-full overflow-hidden rounded-[1.4rem] border border-white/[0.07] bg-white/[0.02] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-volt/30 hover:shadow-[0_24px_70px_-24px_rgba(178,215,66,0.4)] sm:p-8">
            <span className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-teal/10 text-teal">
              <BarChart3 className="size-5" />
            </span>
            <h3 className="text-xl font-bold">{t.app.features[2].title}</h3>
            <p className="mt-3 leading-relaxed text-white/55">{t.app.features[2].body}</p>
            <div className="relative mx-auto mt-6 h-[420px] w-full max-w-[240px]">
              <div
                aria-hidden
                className="absolute inset-0 rounded-[3rem] bg-[radial-gradient(60%_55%_at_50%_45%,rgba(178,215,66,0.18),transparent_70%)] blur-2xl"
              />
              <Image
                src="/landing/grah history mokup.png"
                alt="Nutrition history with 7-day calorie chart and daily breakdown"
                fill
                sizes="240px"
                className="object-contain drop-shadow-[0_40px_80px_rgba(0,0,0,0.85)]"
              />
            </div>
          </div>
        </Item>
      </Stagger>

      {/* coach assignment note */}
      <Item>
        <div className="relative mt-4 flex items-start gap-4 rounded-[1.4rem] border border-volt/20 bg-volt/[0.05] p-6 sm:items-center sm:p-7">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-volt text-[#161806]">
            <UserCheck className="size-5" />
          </span>
          <p className="text-sm leading-relaxed text-white/75 sm:text-base">{t.app.coachNote}</p>
        </div>
      </Item>
    </section>
  );
}
