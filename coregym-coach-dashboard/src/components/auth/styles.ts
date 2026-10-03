/* Shared visual idioms for the auth pages — landing-page tokens (volt pill
   CTA, hairline surfaces, uppercase micro-labels) adapted to form controls.
   Latin-only effects (uppercase/tracking) collapse for Arabic so letter joins
   stay intact; pages pass `isEn` from useI18n(). */

export function authHeadingClass(isEn: boolean): string {
  return isEn
    ? "font-extrabold uppercase leading-[1.1] tracking-[-0.02em] text-[22px]"
    : "text-[22px] font-bold leading-snug";
}

export function authLabelClass(isEn: boolean): string {
  return isEn
    ? "text-[11px] font-bold uppercase tracking-[0.12em] text-white/55"
    : "text-xs font-bold text-white/55";
}

export function authMicroLabelClass(isEn: boolean): string {
  return isEn ? "text-[10px] font-bold uppercase tracking-[0.14em]" : "text-[11px] font-bold";
}

export const AUTH_INPUT_CLASS =
  "h-11 rounded-xl border-white/10 bg-white/[0.04] px-3.5 text-[15px] md:h-10 md:text-[15px] dark:bg-white/[0.04]";

export const AUTH_TEXTAREA_CLASS =
  "min-h-[88px] rounded-xl border-white/10 bg-white/[0.04] px-3.5 py-3 text-[15px] dark:bg-white/[0.04]";

/** Primary CTA — the landing hero pill (volt, glow, gentle scale). */
export function authCtaClass(isEn: boolean): string {
  return `group flex h-12 w-full items-center justify-center gap-2 rounded-full bg-volt text-[13px] font-bold text-[#161806] shadow-[0_0_40px_-8px_rgba(178,215,66,0.5)] outline-none transition-all hover:shadow-[0_0_64px_-6px_rgba(178,215,66,0.7)] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121310] enabled:hover:scale-[1.02] enabled:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-70 ${
    isEn ? "uppercase tracking-wide" : ""
  }`;
}

/** Secondary pill — landing outline CTA (Google sign-in). */
export function authGhostPillClass(isEn: boolean): string {
  return `flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-white/[0.04] text-[13px] font-bold text-white outline-none transition-all hover:border-volt/40 hover:text-volt focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${
    isEn ? "uppercase tracking-wide" : ""
  }`;
}

/** Specialization chips: quiet hairline pills, volt tint when selected. */
export function authChipClass(selected: boolean): string {
  return `rounded-full border px-3.5 py-2 text-xs font-semibold outline-none transition-all focus-visible:ring-3 focus-visible:ring-ring/50 ${
    selected
      ? "border-volt/50 bg-volt/[0.08] text-volt"
      : "border-white/10 bg-white/[0.04] text-white/60 hover:border-white/25 hover:text-white"
  }`;
}

export const PASSWORD_TOGGLE_CLASS =
  "absolute end-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/40 transition-colors outline-none hover:text-volt focus-visible:ring-3 focus-visible:ring-ring/50";
