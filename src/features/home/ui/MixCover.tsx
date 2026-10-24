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

export interface MixCoverProps {
  index: number;
  covers: string[];
  label: string;
  sizes?: string;
  className?: string;
}

export default function MixCover({ index, covers, label, sizes = "175px", className = "" }: MixCoverProps) {
  const [from, to] = PALETTE[(Math.max(1, index) - 1) % PALETTE.length];
  const tiles = covers.length >= 4 ? covers.slice(0, 4) : covers.slice(0, 1);
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} style={{ background: `linear-gradient(135deg, ${from}, ${to})`, containerType: "inline-size" }}>
      {tiles.length > 0 && (
        <div className={`absolute inset-0 grid ${tiles.length === 4 ? "grid-cols-2 grid-rows-2" : ""}`}>
          {tiles.map((src, i) => (
            <div key={`${src}-${i}`} className="relative overflow-hidden">
              <CoverImage src={src} alt="" fill sizes={sizes} className="object-cover" draggable={false} />
            </div>
          ))}
        </div>
      )}
      {/* colour wash: strong at the bottom where the label sits */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to top, ${to} 0%, ${to}cc 22%, ${from}55 55%, ${from}22 100%)`,
          mixBlendMode: "normal",
        }}
      />
      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${from}66, transparent 60%)`, mixBlendMode: "soft-light" }} />
      <div className="absolute left-[9%] bottom-[8%] right-[9%] flex items-end justify-between text-white" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}>
        <span className="text-[clamp(11px,7.5cqw,22px)] font-[700] uppercase tracking-[0.08em] leading-none opacity-95">{label}</span>
        <span className="text-[clamp(28px,26cqw,84px)] font-[800] leading-[0.8] tracking-tight">{index}</span>
      </div>
    </div>
  );
}
