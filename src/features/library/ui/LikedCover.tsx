import { HeartFill } from "@mingcute/react";

/**
 * The cover of "Liked songs": a dark indigo tile with blurred violet-blue
 * light and a soft silver heart. Fills its (relatively positioned) parent; the
 * heart scales with it.
 */
export default function LikedCover({ heartRatio = 0.4 }: { heartRatio?: number }) {
  return (
    <span
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(55% 48% at 72% 5%, rgba(103,72,194,0.52) 0%, rgba(103,72,194,0) 100%)," +
          "radial-gradient(75% 60% at 90% 100%, rgba(47,61,151,0.72) 0%, rgba(47,61,151,0) 100%)," +
          "radial-gradient(72% 65% at 28% 82%, rgba(16,20,47,0.92) 0%, rgba(16,20,47,0) 100%)," +
          "linear-gradient(145deg, #24213f 0%, #161629 58%, #202449 100%)",
        containerType: "size",
      }}
    >
      {/* fine grain so the gradient doesn't band */}
      <span
        className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className="relative flex items-center justify-center text-white"
          style={{
            width: `${heartRatio * 100}cqmin`,
            height: `${heartRatio * 100}cqmin`,
            filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.18))",
            color: "#d0cfd5",
          }}
        >
          <HeartFill className="h-full w-full" />
        </span>
      </span>
    </span>
  );
}
