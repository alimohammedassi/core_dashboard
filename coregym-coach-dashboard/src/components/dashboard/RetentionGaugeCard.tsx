"use client";

import { Card } from "@/components/ui/card";
import { MoreHorizontal } from "lucide-react";

export function RetentionGaugeCard({ value, target = 80, total }: { value?: number | null; target?: number; total?: number }) {
  const hasData = typeof value === "number" && total !== undefined && total > 0;
  if (!hasData) {
    return (
      <Card className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] p-5 gap-2 shadow-none">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">Client Retention Rate</h3>
          <MoreHorizontal className="size-3.5 text-[var(--text-muted)]" />
        </div>
        <div className="flex h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] bg-[var(--surface-3)]/30">
          <p className="text-sm text-[var(--text-muted)]">No retention data</p>
          <p className="text-xs text-[var(--text-muted)]">Requires at least one subscription.</p>
        </div>
      </Card>
    );
  }
  // Semi-circular gauge: 180 deg arc with segmented dashes
  const segments = 30;
  const filled = Math.round((value / 100) * segments);
  const radius = 84;
  const centerX = 100;
  const centerY = 92;

  // Generate arc segments: from 180deg to 0deg
  function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  return (
    <Card className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--surface-2)] p-5 gap-2 shadow-none">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">Client Retention Rate</h3>
        <MoreHorizontal className="size-3.5 text-[var(--text-muted)]" />
      </div>

      <div className="relative flex flex-col items-center">
        <svg width={200} height={110} viewBox="0 0 200 110" className="mt-1">
          {Array.from({ length: segments }).map((_, i) => {
            const startAngle = 180 - (i * 180) / segments + 2;
            const endAngle = 180 - ((i + 1) * 180) / segments - 2;
            const mid = (startAngle + endAngle) / 2;
            const isFilled = i < filled;
            const rInner = radius - 10;
            // Use stroke approach simpler: draw short arc line
            const a = polarToCartesian(centerX, centerY, radius, mid);
            const b = polarToCartesian(centerX, centerY, rInner, mid);
            const color = isFilled ? "var(--primary)" : "rgba(255,255,255,0.08)";
            const opacity = isFilled ? 1 - i * 0.015 : 1;
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeOpacity={opacity} strokeWidth={4} strokeLinecap="round" />;
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pt-6">
          <span className="text-3xl font-bold text-white leading-none">{value}%</span>
          <span className="mt-1 text-xs text-[var(--text-muted)]">On track for {target}% target</span>
        </div>
      </div>

      <div className="flex justify-center">
        <button className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[var(--surface-3)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:bg-white/10 transition-colors">
          Show details
        </button>
      </div>
    </Card>
  );
}
