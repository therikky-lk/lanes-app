export interface MixCoverProps {
  index: number;
  covers: string[];
  label: string;
  sizes?: string;
  className?: string;
  showBadge?: boolean;
}

/** Crisp, inexpensive tiles: no network covers or live image filters. */
export default function MixCover({ index, label, className = "" }: MixCoverProps) {
  const hue = [0, 20, 40, 65, 115, 160, 195, 220, 250, 280][(Math.max(1, index) - 1) % 10];
  return <div className={`absolute inset-0 flex flex-col overflow-hidden bg-[#f4f4f5] p-[5%] text-[#18181b] dark:bg-[#161616] dark:text-white ${className}`} style={{ containerType: "inline-size" }}>
    <div className="flex items-start justify-between gap-2">
      <span className="text-[clamp(12px,9cqw,26px)] font-bold leading-none tracking-tight">{label} {String(index).padStart(2, "0")}</span>
      <span className="text-[clamp(8px,5cqw,15px)] font-bold leading-none">Lane</span>
    </div>
    <div className="mt-[5%] text-[clamp(12px,9cqw,26px)] font-semibold leading-none tracking-tight">Daily</div>
    <div className="mt-[5%] grid min-h-0 flex-1 grid-cols-5 grid-rows-4 overflow-hidden">
      {Array.from({ length: 20 }, (_, tile) => {
        const x = tile % 5;
        const y = Math.floor(tile / 5);
        const light = 28 + x * 12 + Math.sin((y + index) * 1.8 + x * 0.6) * 12;
        return <span key={tile} style={{ background: `hsl(${hue + y * 8} 84% ${Math.min(94, Math.max(16, light))}%)` }} />;
      })}
    </div>
  </div>;
}
