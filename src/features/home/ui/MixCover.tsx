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
    <div
      className={`absolute inset-0 flex flex-col overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})`, containerType: "inline-size" }}
    >
      {/* artwork on top, nothing written over it */}
      <div className={`relative min-h-0 flex-1 grid ${tiles.length === 4 ? "grid-cols-2 grid-rows-2" : ""}`}>
        {tiles.map((src, i) => (
          <div key={`${src}-${i}`} className="relative overflow-hidden">
            <CoverImage src={src} alt="" fill sizes={sizes} className="object-cover" draggable={false} />
          </div>
        ))}
      </div>
      {/* the mix's colour band with its name */}
      <div
        className="flex shrink-0 items-center justify-between px-[8%] text-white"
        style={{ height: "26%", background: `linear-gradient(90deg, ${from}, ${to})` }}
      >
        <span className="text-[clamp(10px,7cqw,20px)] font-[700] uppercase tracking-[0.1em] leading-none" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.25)" }}>
          {label}
        </span>
        <span className="text-[clamp(16px,15cqw,44px)] font-[800] leading-none tracking-tight" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.25)" }}>
          {index}
        </span>
      </div>
    </div>
  );
}
