"use client";

import Image from "next/image";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

/* ── Realistic device frame: layered metallic rail, dynamic island, ─────────
   diagonal glare sweep, tinted ambient shadow + HeroShowcase-style tilt. ─── */

type GlowColor = "volt" | "teal" | "gold";

const GLOW_RGB: Record<GlowColor, string> = {
  volt: "178, 215, 66",
  teal: "79, 209, 197",
  gold: "232, 196, 104",
};

type PhoneMockupProps = {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  glow?: GlowColor;
  /** mouse-reactive 3D tilt (same pattern as HeroShowcase). Always off under reduced motion. */
  tilt?: boolean;
};

export function PhoneMockup({
  src,
  alt,
  sizes,
  priority,
  className,
  glow = "volt",
  tilt = true,
}: PhoneMockupProps) {
  const reduced = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [5, -5]), { stiffness: 60, damping: 18 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-6, 6]), { stiffness: 60, damping: 18 });
  const interactive = tilt && !reduced;

  return (
    <div
      onMouseMove={
        interactive
          ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              mx.set((e.clientX - rect.left) / rect.width - 0.5);
              my.set((e.clientY - rect.top) / rect.height - 0.5);
            }
          : undefined
      }
      onMouseLeave={
        interactive
          ? () => {
              mx.set(0);
              my.set(0);
            }
          : undefined
      }
      className={`relative [perspective:1200px] ${className ?? ""}`}
    >
      <motion.div
        style={interactive ? { rotateX, rotateY, transformStyle: "preserve-3d" } : undefined}
        className="relative"
      >
        {/* tinted ambient shadow */}
        <div
          aria-hidden
          className="absolute -inset-8 -z-10 rounded-[4rem] blur-2xl"
          style={{
            background: `radial-gradient(60% 55% at 50% 45%, rgba(${GLOW_RGB[glow]}, 0.22), transparent 70%)`,
          }}
        />

        {/* machined side buttons hugging the rail */}
        <span aria-hidden className="absolute -left-[2.5px] top-[17.5%] z-20 h-[3.2%] w-[3px] rounded-full bg-gradient-to-b from-[#6a6e74] to-[#26282c]" />
        <span aria-hidden className="absolute -left-[2.5px] top-[24%] z-20 h-[5.6%] w-[3px] rounded-full bg-gradient-to-b from-[#6a6e74] to-[#26282c]" />
        <span aria-hidden className="absolute -left-[2.5px] top-[31%] z-20 h-[5.6%] w-[3px] rounded-full bg-gradient-to-b from-[#6a6e74] to-[#26282c]" />
        <span aria-hidden className="absolute -right-[2.5px] top-[26.5%] z-20 h-[8.4%] w-[3px] rounded-full bg-gradient-to-b from-[#6a6e74] to-[#26282c]" />

        {/* layered metallic rail: polished edge → dark core */}
        <div className="relative rounded-[3.4rem] bg-gradient-to-br from-[#7d8187] via-[#232529] to-[#4d5055] p-[3px] shadow-[0_50px_100px_-24px_rgba(0,0,0,0.9)]">
          <div className="rounded-[3.25rem] bg-gradient-to-b from-[#3a3d42] to-[#0f1113] p-[1.5px]">
            {/* black bezel */}
            <div className="rounded-[3.15rem] bg-black p-[7px]">
              <div className="relative aspect-[1180/2556] overflow-hidden rounded-[2.75rem] bg-[#f4f3ee]">
                <Image
                  src={src}
                  alt={alt}
                  fill
                  sizes={sizes ?? "360px"}
                  className="object-cover object-top"
                  priority={priority}
                />

                {/* dynamic island with lens */}
                <span className="absolute left-1/2 top-[2.3%] z-10 flex h-[4.6%] w-[26%] -translate-x-1/2 items-center justify-end rounded-full bg-black pr-[9%]">
                  <span className="aspect-square h-[62%] rounded-full bg-[#101418] ring-[1.5px] ring-[#1f2a33]" />
                </span>

                {/* diagonal glare sweep */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-y-8 -left-1/3 z-10 w-1/2 rotate-[18deg] bg-gradient-to-r from-transparent via-white/[0.09] to-transparent"
                />
                {/* top light + bottom shade for glass depth */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-white/[0.07] via-transparent to-black/[0.06]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* floor glow */}
        <div
          aria-hidden
          className="absolute inset-x-10 -bottom-5 h-8 rounded-full blur-2xl"
          style={{ background: `rgba(${GLOW_RGB[glow]}, 0.18)` }}
        />
      </motion.div>
    </div>
  );
}

/* ── Three-phone fanned arrangement (center front, sides tilted back) ─────── */

type StackPhone = { src: string; alt: string };

export function PhoneStack({
  phones,
  sizes,
  glow = "volt",
  className,
}: {
  phones: [StackPhone, StackPhone, StackPhone];
  sizes?: string;
  glow?: GlowColor;
  className?: string;
}) {
  const [left, center, right] = phones;

  return (
    <div className={`flex items-end justify-center ${className ?? ""}`}>
      <div className="relative -me-6 w-[118px] -rotate-[8deg] translate-y-4 sm:-me-8 sm:w-[148px]">
        <PhoneMockup src={left.src} alt={left.alt} sizes={sizes ?? "180px"} glow={glow} />
      </div>
      <div className="relative z-10 w-[148px] sm:w-[180px]">
        <PhoneMockup src={center.src} alt={center.alt} sizes={sizes ?? "220px"} glow={glow} priority />
      </div>
      <div className="relative -ms-6 w-[118px] rotate-[8deg] translate-y-4 sm:-ms-8 sm:w-[148px]">
        <PhoneMockup src={right.src} alt={right.alt} sizes={sizes ?? "180px"} glow={glow} />
      </div>
    </div>
  );
}
