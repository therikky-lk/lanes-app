import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "@/languages";
import { useYoutubeSignInStore } from "../store/youtubeSignInStore";
import { useYoutubeSignInPrompt } from "../hooks/useYoutubeSignInPrompt";

export default function YoutubeSignInNotice() {
  useYoutubeSignInPrompt();
  const { t } = useTranslation();
  const open = useYoutubeSignInStore((state) => state.open);
  const phase = useYoutubeSignInStore((state) => state.phase);
  const code = useYoutubeSignInStore((state) => state.code);
  const dismiss = useYoutubeSignInStore((state) => state.dismiss);
  const retry = useYoutubeSignInStore((state) => state.retry);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-live="polite"
          data-no-window-drag
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="fixed left-1/2 top-[28px] z-[9998] flex w-[520px] max-w-[calc(100vw-24px)] -translate-x-1/2 flex-col gap-[14px] rounded-[22px] bg-bg-elevated/80 p-[20px] text-text-primary shadow-2xl backdrop-blur-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="m-0 text-[17px] font-[600]">
                {t("youtube_auth.title") || "Sign in to YouTube to keep listening"}
              </h2>
              <p className="mb-0 mt-[6px] text-[13px] text-text-secondary">
                {t("youtube_auth.description") || "Approve this device with your Google account to continue playback."}
              </p>
            </div>
            <button type="button" onClick={dismiss} aria-label={t("common.close") || "Close"} className="rounded-lg border-0 bg-transparent px-2 py-1 text-text-secondary hover:bg-white/10 hover:text-text-primary">×</button>
          </div>

          {code ? (
            <div className="flex flex-wrap items-center justify-between gap-[12px] rounded-[14px] bg-white/[0.08] p-[14px]">
              <div className="flex flex-col gap-[5px]">
                <span className="text-[12px] text-text-secondary">{t("youtube_auth.activate_at") || "Open the activation page and enter this code"}</span>
                <strong className="text-[22px] tracking-[0.12em]">{code.userCode}</strong>
              </div>
              <a href={code.activationUrl} target="_blank" rel="noreferrer" className="rounded-[10px] bg-text-primary px-[14px] py-[10px] text-[13px] font-[500] text-bg-primary no-underline">
                {t("youtube_auth.open_activation") || "Open activation page"}
              </a>
            </div>
          ) : (
            <div className="h-[56px] animate-pulse rounded-[14px] bg-white/[0.08]" />
          )}

          <div className="flex justify-end gap-[8px]">
            {phase === "error" && <button type="button" onClick={retry} className="rounded-[10px] border-0 bg-white/[0.14] px-[13px] py-[8px] text-[13px] text-text-primary">{t("youtube_auth.retry") || "Try again"}</button>}
            <button type="button" onClick={dismiss} className="rounded-[10px] border-0 bg-transparent px-[13px] py-[8px] text-[13px] text-text-secondary hover:bg-white/[0.08]">{t("youtube_auth.not_now") || "Not now"}</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
