import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import { humanCheckPageUrl } from "@/shared/api";
import { isNativeApp } from "@/shared/platform/native";
import { humanCheckUserAgent, nativeHumanCheck } from "@/shared/platform/nativeHumanCheck";
import { useHumanCheckStore } from "../store/humanCheckStore";
import HumanCheckFrame from "./HumanCheckFrame";

let nativeAttemptId = 0;

export default function HumanCheckNotice() {
  const { t } = useTranslation();
  const request = useHumanCheckStore((state) => state.request);
  const phase = useHumanCheckStore((state) => state.phase);
  const attempt = useHumanCheckStore((state) => state.attempt);
  const retry = useHumanCheckStore((state) => state.retry);
  const cancel = useHumanCheckStore((state) => state.cancel);

  useEffect(() => {
    if (!request || !isNativeApp()) return;
    let active = true;
    const id = `human-check-${++nativeAttemptId}`;
    void nativeHumanCheck.verify({
      id,
      url: humanCheckPageUrl(request.action),
      action: request.action,
      userAgent: humanCheckUserAgent(),
      title: t("human_check.title"),
      cancel: t("human_check.cancel"),
    }).then((result) => {
      if (!active) return;
      if (result.token) useHumanCheckStore.getState().solve(result.token);
      else useHumanCheckStore.getState().cancel();
    }).catch(() => {
      if (active) useHumanCheckStore.getState().setPhase("error");
    });
    return () => {
      active = false;
      void nativeHumanCheck.close({ id }).catch(() => undefined);
    };
  }, [request, attempt, t]);

  useEffect(() => {
    if (!request || isNativeApp()) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, cancel]);

  if (typeof document === "undefined") return null;
  const failed = phase === "error" || phase === "expired";
  const nativeApp = isNativeApp();
  if (nativeApp && !failed) return null;

  return createPortal(
    <AnimatePresence>
      {request && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          data-no-window-drag
          initial={{ opacity: 0, y: -16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <section className="w-[396px] max-w-full rounded-[24px] border border-white/10 bg-[#202023]/95 p-[18px] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-[16px] font-semibold text-white">{t("human_check.title")}</h2>
            <p className="mt-1 text-[13px] leading-[1.4] text-white/65">
              {phase === "expired" ? t("human_check.expired") : failed ? t("human_check.failed") : t("human_check.description")}
            </p>
            {!nativeApp && <div className="mt-3"><HumanCheckFrame action={request.action} attempt={attempt} /></div>}
            <div className="mt-2 flex gap-2">
              <Button className="flex-1" disabled={!failed} onClick={failed ? retry : undefined}>
                {failed ? t("human_check.retry") : t("human_check.waiting")}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={cancel}>
                {request.mode === "optional" ? t("human_check.skip") : t("human_check.cancel")}
              </Button>
            </div>
          </section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
