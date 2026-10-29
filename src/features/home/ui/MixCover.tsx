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
  showBadge?: boolean;
}

export default function MixCover({ index, covers, label, sizes = "165px", className = "", showBadge = true }: MixCoverProps) {
  const [from, to] = PALETTE[(Math.max(1, index) - 1) % PALETTE.length];
  const tiles = covers.length >= 4 ? covers.slice(0, 4) : covers.slice(0, 1);
  return (
    <div
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})`, containerType: "inline-size" }}
    >
      {/* artwork across the whole cover */}
      <div className={`absolute inset-0 grid ${tiles.length === 4 ? "grid-cols-2 grid-rows-2" : ""}`}>
        {tiles.map((src, i) => (
          <div key={`${src}-${i}`} className="relative overflow-hidden">
            <CoverImage src={src} alt="" fill sizes={sizes} className="object-cover" draggable={false} />
          </div>
        ))}
      </div>
      {/* The artwork stays visible behind the type, with a soft cinematic fade. */}
      <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/75 to-transparent" />
      {showBadge && (
        <div className="absolute inset-x-[8%] bottom-[7%] flex items-end justify-between text-white">
          <span className="text-[clamp(10px,7cqw,20px)] font-[700] uppercase tracking-[0.1em] leading-none" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.3)" }}>
            {label}
          </span>
          <span className="text-[clamp(18px,17cqw,52px)] font-[800] leading-[0.8] tracking-tight" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.3)" }}>
            {index}
          </span>
        </div>
      )}
    </div>
  );
}
