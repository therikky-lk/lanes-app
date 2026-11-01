import { useEffect, useRef } from "react";
import { humanCheckOrigin, humanCheckPageUrl, type HumanCheckAction } from "@/shared/api";
import { useHumanCheckStore } from "../store/humanCheckStore";

interface CheckMessage {
  source?: string;
  action?: string;
  type?: "token" | "error" | "expired";
  token?: string;
}

export default function HumanCheckFrame({ action, attempt }: { action: HumanCheckAction; attempt: number }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const phase = useHumanCheckStore((state) => state.phase);
  const setPhase = useHumanCheckStore((state) => state.setPhase);
  const solve = useHumanCheckStore((state) => state.solve);

  useEffect(() => {
    const origin = humanCheckOrigin();
    const onMessage = (event: MessageEvent<CheckMessage>) => {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return;
      const data = event.data;
      if (data?.source !== "liner-turnstile" || data.action !== action) return;
      if (data.type === "token" && data.token) solve(data.token);
      else if (data.type === "expired") setPhase("expired");
      else if (data.type === "error") setPhase("error");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [action, setPhase, solve]);

  const markLoaded = () => {
    if (useHumanCheckStore.getState().phase === "loading") setPhase("ready");
  };

  return (
    <div className="relative mx-auto h-[88px] w-[320px] max-w-full shrink-0">
      <div className={`absolute inset-x-[10px] top-[11px] h-[65px] animate-pulse rounded-[10px] bg-white/10 transition-opacity ${phase === "loading" ? "opacity-100" : "opacity-0"}`} />
      <iframe
        key={attempt}
        ref={frameRef}
        src={humanCheckPageUrl(action)}
        title="Cloudflare human verification"
        scrolling="no"
        onLoad={markLoaded}
        className={`absolute inset-0 size-full border-0 bg-transparent transition-opacity duration-300 [color-scheme:dark] ${phase === "loading" ? "opacity-0" : "opacity-100"}`}
      />
    </div>
  );
}
