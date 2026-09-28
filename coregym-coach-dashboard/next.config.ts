import type { NextConfig } from "next";

// S9/LV5: baseline security headers. CSP allows Next.js inline scripts,
// Supabase (REST + realtime wss + storage), Stripe.js, and Google Fonts
// (poppins/cairo per root layout). microphone=(self) preserves the chat
// voice-note recorder; camera/geolocation are unused by getUserMedia APIs.
// NOTE: Vercel regions / function maxDuration are intentionally left at
// project defaults — pinning needs a plan/audience decision (manual step,
// see docs/remediation-log.md item 12).
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // CFG-04: 'unsafe-eval' removed — production React/Next do not require
      // eval. Dev mode (Turbopack HMR) re-adds it automatically and is not
      // affected by production headers. 'unsafe-inline' must stay until the
      // inline bootstrap scripts are nonce-gated (documented follow-up).
      "script-src 'self' 'unsafe-inline' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.supabase.co",
      "media-src 'self' blob: https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // PERF-07: landing media currently revalidates on every view (source PNGs
  // ship Cache-Control: max-age=0 and the optimizer inherits it). A minimum
  // TTL makes the image optimizer responses edge-cacheable; modern formats
  // are negotiated per Accept header automatically.
  images: {
    minimumCacheTTL: 86_400,
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
