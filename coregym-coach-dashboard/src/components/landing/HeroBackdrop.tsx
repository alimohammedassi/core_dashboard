"use client";

import { useEffect, useRef } from "react";

/* Swap this with a real CoreGym training clip when one exists —
   until then this public demo stream provides the ambient motion. */
export const HERO_VIDEO_URL =
  "https://stream.mux.com/tLkHO1qZoaaQOUeVWo8hEBeGQfySP02EPS02BmnNFyXys.m3u8";

function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let cancelled = false;
    let hls: import("hls.js").default | null = null;

    (async () => {
      try {
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = HERO_VIDEO_URL;
          video.play().catch(() => {});
          return;
        }
        const { default: Hls } = await import("hls.js");
        if (cancelled || !Hls.isSupported()) return;
        hls = new Hls({ enableWorker: false });
        hls.loadSource(HERO_VIDEO_URL);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      } catch {
        /* stream unavailable — the hero falls back to the dark gradient backdrop */
      }
    })();

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, []);

  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      autoPlay
      preload="auto"
      className="h-full w-full object-cover opacity-60"
    />
  );
}

export function HeroBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <HeroVideo />

      {/* readability gradients: dark from the inline start + bottom-up */}
      <div className="absolute inset-0 ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-[#0a0b08] via-[#0a0b08]/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0b08] via-transparent to-[#0a0b08]/85" />

      {/* three vertical hairlines at 25 / 50 / 75% — desktop only */}
      <div className="absolute inset-0 hidden md:block">
        {[25, 50, 75].map((x) => (
          <span key={x} className="absolute inset-y-0 w-px bg-white/10" style={{ left: `${x}%` }} />
        ))}
      </div>

      {/* central horizontal ellipse glow with a 25px gaussian blur */}
      <svg
        className="absolute left-1/2 top-[6%] h-[340px] w-[820px] -translate-x-1/2"
        viewBox="0 0 820 340"
        fill="none"
      >
        <defs>
          <filter id="hero-glow-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="25" />
          </filter>
        </defs>
        <ellipse cx="410" cy="170" rx="330" ry="110" fill="rgba(178, 215, 66, 0.16)" filter="url(#hero-glow-blur)" />
        <ellipse cx="410" cy="150" rx="210" ry="78" fill="rgba(79, 209, 197, 0.10)" filter="url(#hero-glow-blur)" />
      </svg>
    </div>
  );
}
