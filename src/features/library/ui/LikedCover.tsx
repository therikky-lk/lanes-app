import { HeartFill } from "@mingcute/react";

/**
 * The cover of "Liked songs": a deep rose-to-violet gradient with soft light
 * blooms and a glossy heart. Fills its (relatively positioned) parent; the
 * heart scales with it.
 */
export default function LikedCover({ heartRatio = 0.4 }: { heartRatio?: number }) {
  return (
    <span
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 90% at 18% 12%, rgba(255,170,190,0.55) 0%, rgba(255,170,190,0) 45%)," +
          "radial-gradient(90% 80% at 92% 95%, rgba(120,60,255,0.65) 0%, rgba(120,60,255,0) 55%)," +
          "linear-gradient(145deg, #ff4f7b 0%, #e01e5a 38%, #9b1fb8 78%, #5a1aa8 100%)",
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
            filter: "drop-shadow(0 6px 18px rgba(70,0,40,0.45))",
          }}
        >
          <HeartFill className="h-full w-full" />
        </span>
      </span>
    </span>
  );
}
