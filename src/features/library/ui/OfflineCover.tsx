import { TimeLine, FileMusicFill } from "@mingcute/react";
export default function OfflineCover({ kind }: { kind: "cache" | "local" }) {
  const Icon = kind === "cache" ? TimeLine : FileMusicFill;
  return <span aria-hidden className="absolute inset-0 flex items-center justify-center overflow-hidden" style={{
    containerType: "size",
    background: kind === "cache"
      ? "radial-gradient(ellipse at 12% 68%, #8b3d1a 0%, transparent 57%), radial-gradient(ellipse at 85% 95%, #bc672f 0%, transparent 45%), linear-gradient(130deg, #3c2419, #17111a 65%)"
      : "radial-gradient(ellipse at 90% 100%, #24756d 0%, transparent 59%), radial-gradient(ellipse at 65% 0%, #197761 0%, transparent 47%), linear-gradient(130deg, #1e3c50, #101e29 65%)",
  }}><Icon style={{ width: "46cqmin", height: "46cqmin", color: "#c8cdd0" }} /></span>;
}
