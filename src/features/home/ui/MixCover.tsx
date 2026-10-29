import CoverImage from "@/features/covers/ui/CoverImage";

// Lane's own cover for a daily mix: a 2×2 mosaic of its artists' covers,
// washed in the mix's colour, with the mix number in the corner.

const PALETTE: [string, string][] = [
  ["#ff5f6d", "#ffc371"],
  ["#4facfe", "#00f2fe"],
  ["#a18cd1", "#fbc2eb"],
  ["#43e97b", "#38f9d7"],
  ["#fa709a", "#fee140"],
  ["#667eea", "#764ba2"],
  ["#f6d365", "#fda085"],
  ["#30cfd0", "#330867"],
  ["#ff9a9e", "#a1c4fd"],
  ["#c471f5", "#fa71cd"],
];

const DESIGN_COLORS: [string, string][] = [
  ["#4c5fc5", "#e6a8c7"],
  ["#5478bd", "#a9d9e8"],
  ["#345bb7", "#dca9cc"],
  ["#357b77", "#b5e2d6"],
  ["#b15b8f", "#f4c2b8"],
  ["#6354b5", "#d1b4e7"],
  ["#b07d36", "#f3d99c"],
  ["#3a87a1", "#b8dfe5"],
  ["#7b55b2", "#f0b7d2"],
  ["#c36b48", "#f3d9a1"],
];

export interface MixCoverProps {
  index: number;
  covers: string[];
  label: string;
  sizes?: string;
  className?: string;
  showBadge?: boolean;
}

export default function MixCover({ index, covers, label, sizes = "165px", className = "", showBadge = true }: MixCoverProps) {
  const [from, to] = PALETTE[(Math.max(1, index) - 1) % PALETTE.length];
  const [designFrom, designTo] = DESIGN_COLORS[(Math.max(1, index) - 1) % DESIGN_COLORS.length];
  const shape = (Math.max(1, index) - 1) % 3;
  const tiles = covers.length >= 4 ? covers.slice(0, 4) : covers.slice(0, 1);
  return (
    <div
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})`, containerType: "inline-size" }}
    >
      {/* artwork across the whole cover */}
      <div className={`absolute inset-0 grid ${tiles.length === 4 ? "grid-cols-2 grid-rows-2" : ""}`}>
        {tiles.map((src, i) => (
          <div key={`${src}-${i}`} className="relative overflow-hidden opacity-[0.58]">
            <CoverImage src={src} alt="" fill sizes={sizes} className="object-cover" draggable={false} />
          </div>
        ))}
      </div>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, rgba(255,255,255,0.48), ${designTo}a0 55%, ${designFrom}85)`,
        }}
      />
      {shape === 0 && (
        <>
          <div className="pointer-events-none absolute -right-[52%] -top-[35%] h-[145%] w-[145%] rounded-full border-[clamp(14px,2.8cqw,34px)] border-white/80" />
          <div className="pointer-events-none absolute -right-[67%] -top-[17%] h-[138%] w-[138%] rounded-full border-[clamp(10px,2cqw,25px)] border-white/70" />
          <div className="pointer-events-none absolute -right-[83%] top-[5%] h-[132%] w-[132%] rounded-full border-[clamp(7px,1.4cqw,18px)] border-white/55" />
        </>
      )}
      {shape === 1 && (
        <>
          <div className="pointer-events-none absolute -left-[35%] top-[5%] h-[24%] w-[175%] rotate-[28deg] rounded-full border-[clamp(12px,2.5cqw,30px)] border-white/75" />
          <div className="pointer-events-none absolute -left-[28%] top-[34%] h-[22%] w-[165%] rotate-[28deg] rounded-full border-[clamp(9px,1.8cqw,22px)] border-white/65" />
          <div className="pointer-events-none absolute -left-[20%] top-[65%] h-[19%] w-[150%] rotate-[28deg] rounded-full border-[clamp(6px,1.2cqw,15px)] border-white/50" />
        </>
      )}
      {shape === 2 && (
        <>
          <div className="pointer-events-none absolute -left-[38%] -top-[10%] h-[125%] w-[125%] rounded-[46%] border-[clamp(12px,2.5cqw,30px)] border-white/75 rotate-[-24deg]" />
          <div className="pointer-events-none absolute -left-[22%] top-[8%] h-[105%] w-[105%] rounded-[45%] border-[clamp(9px,1.8cqw,22px)] border-white/65 rotate-[-24deg]" />
          <div className="pointer-events-none absolute -left-[6%] top-[26%] h-[82%] w-[82%] rounded-[44%] border-[clamp(6px,1.2cqw,15px)] border-white/50 rotate-[-24deg]" />
        </>
      )}
      <div className="pointer-events-none absolute left-[9%] top-[9%] flex h-[clamp(30px,14cqw,72px)] w-[clamp(30px,14cqw,72px)] items-center justify-center rounded-full bg-white/70 text-[clamp(16px,7cqw,38px)] text-[#5368bf] shadow-sm">
        <span className="leading-none">✦</span>
      </div>
      {showBadge && (
        <div className="absolute inset-x-[8%] bottom-[7%] flex items-end justify-between text-[#304caf]">
          <span className="text-[clamp(10px,7cqw,20px)] font-[700] uppercase tracking-[0.1em] leading-none">
            {label}
          </span>
          <span className="text-[clamp(18px,17cqw,52px)] font-[800] leading-[0.8] tracking-tight">
            {index}
          </span>
        </div>
      )}
    </div>
  );
}
