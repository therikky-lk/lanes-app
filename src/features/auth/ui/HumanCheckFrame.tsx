import { useTranslation } from "@/languages";
import { useEffect, useRef } from "react";
import { humanCheckOrigin, humanCheckPageUrl, type HumanCheckAction } from "@/shared/api";
import { useHumanCheckStore } from "../store/humanCheckStore";

interface CheckMessage {
  source?: string;
  action?: string;
  type?: "token" | "error" | "expired";
  token?: string;
}

export default function HumanCheckFrame({ action, attempt, apiBaseUrl }: { action: HumanCheckAction; attempt: number; apiBaseUrl?: string }) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const phase = useHumanCheckStore((state) => state.phase);
  const setPhase = useHumanCheckStore((state) => state.setPhase);
  const solve = useHumanCheckStore((state) => state.solve);

  useEffect(() => {
    let active = true;
    // An iframe's load event also fires for Android's built-in network error
    // page. Require a token and stop waiting even if the page never responds.
    const timeout = setTimeout(() => {
      if (active) setPhase("error");
    }, 60_000);
    const origin = humanCheckOrigin(apiBaseUrl);
    const onMessage = (event: MessageEvent<CheckMessage>) => {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return;
      const data = event.data;
      if (data?.source !== "liner-turnstile" || data.action !== action) return;
      if (data.type === "token" && data.token) { clearTimeout(timeout); solve(data.token); }
      else if (data.type === "expired") setPhase("expired");
      else if (data.type === "error") setPhase("error");
    };
    window.addEventListener("message", onMessage);
    return () => {
      active = false;
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };
  }, [action, apiBaseUrl, attempt, setPhase, solve, t]);

  const markLoaded = () => {
    if (useHumanCheckStore.getState().phase === "loading") setPhase("ready");
  };

  return (
    <div className="relative mx-auto h-[220px] w-[360px] max-w-full shrink-0">
      <div className={`absolute inset-x-[10px] top-[11px] h-[200px] animate-pulse rounded-[10px] bg-white/10 transition-opacity ${phase === "loading" ? "opacity-100" : "opacity-0"}`} />
      {phase !== "error" && phase !== "expired" && <iframe
        key={attempt}
        ref={frameRef}
        src={humanCheckPageUrl(action, apiBaseUrl)}
        title={t("human_check.frame_title")}
        scrolling="no"
        onLoad={markLoaded}
        onError={() => setPhase("error")}
        className={`absolute inset-0 size-full border-0 bg-transparent transition-opacity duration-300 [color-scheme:dark] ${phase === "loading" ? "opacity-0" : "opacity-100"}`}
      />}
    </div>
  );
}
