import type { ReactNode } from "react";
import laneLogo from "@/assets/logo.svg";

export interface MixCoverProps {
  index: number;
  covers: string[];
  label: string;
  sizes?: string;
  className?: string;
  showBadge?: boolean;
  compact?: boolean;
}

export function MixCoverFrame({ title, subtitle, children, className = "", compact = false }: {
  title: string; subtitle: string; children: ReactNode; className?: string; compact?: boolean;
}) {
  return <div className={`absolute inset-0 flex flex-col overflow-hidden bg-bg-elevated p-[5%] text-text-primary ${className}`} style={{ containerType: "inline-size" }}>
    <div className={`relative flex items-start ${compact ? "pr-[9px]" : "pr-[clamp(22px,15cqw,54px)]"}`}>
      <span className={`font-bold leading-none tracking-tight ${compact ? "truncate text-[8px]" : "text-[clamp(12px,9cqw,26px)]"}`}>{title}</span>
      <span aria-hidden className={`pointer-events-none absolute right-0 top-0 bg-current ${compact ? "size-[9px]" : "size-[clamp(18px,13cqw,48px)]"}`}
        style={{ mask: `url("${laneLogo}") center / contain no-repeat` }} />
    </div>
    {!compact && <div className="mt-[5%] truncate text-[clamp(12px,9cqw,26px)] font-semibold leading-none tracking-tight">{subtitle}</div>}
    <div className="relative mt-[5%] grid min-h-0 flex-1 grid-cols-5 grid-rows-4 overflow-hidden">{children}</div>
  </div>;
}

/** Crisp, inexpensive tiles: no network covers or live image filters. */
export default function MixCover({ index, label, className, compact }: MixCoverProps) {
  const hue = [0, 20, 40, 65, 115, 160, 195, 220, 250, 280][(Math.max(1, index) - 1) % 10];
  return (
    <MixCoverFrame title={`${label} ${String(index).padStart(2, "0")}`} subtitle="Daily" className={className} compact={compact}>
      {Array.from({ length: 20 }, (_, tile) => {
        const x = tile % 5;
        const y = Math.floor(tile / 5);
        const light = 28 + x * 12 + Math.sin((y + index) * 1.8 + x * 0.6) * 12;
        return <span key={tile} style={{ background: `hsl(${hue + y * 8} 84% ${Math.min(94, Math.max(16, light))}%)` }} />;
      })}
    </MixCoverFrame>
  );
}
