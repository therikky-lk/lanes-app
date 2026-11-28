import { useTranslation } from "@/languages";
import { LuMaximize2, LuMinimize2, LuMinus, LuSquare, LuX } from "react-icons/lu";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";
import { useWindowState } from "../hooks/useWindowState";
import { useWindowAnimationStore } from "@/shared/ui";

export interface WindowControlsProps {
  className?: string;
  variant?: "default" | "glass" | "island";
  style?: React.CSSProperties;
  isFullscreen?: boolean;
}

// the window goes away right under the cursor (minimize / into the overlay), so
// chromium never sees the pointer leave and the button keeps its hover look when the
// window comes back. while this flag is on the control buttons drop their hover
// highlight; it clears on the first real mouse move after the window is back.
function suppressStaleHover() {
  const root = document.documentElement;
  root.setAttribute("data-hover-reset", "");
  (document.activeElement as HTMLElement | null)?.blur?.();
  let wentAway = false;
  const clear = () => root.removeAttribute("data-hover-reset");
  const onAway = () => {
    wentAway = true;
  };
  const onBack = () => {
    if (!wentAway) return;
    window.removeEventListener("blur", onAway);
    window.removeEventListener("focus", onBack);
    document.removeEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointermove", clear, { once: true });
  };
  const onVisibility = () => (document.hidden ? onAway() : onBack());
  window.addEventListener("blur", onAway);
  window.addEventListener("focus", onBack);
  document.addEventListener("visibilitychange", onVisibility);
}

export default function WindowControls({
  className = "",
  variant = "default",
  style,
  isFullscreen = false,
}: WindowControlsProps) {
  const { t } = useTranslation();
  const { isFullScreen: isWindowFullScreen, isMaximized: isWindowMaximized } = useWindowState();

  const electron = window.linerElectron;
  const isHyprland = electron?.isHyprland ?? false;

  const handleMinimize = () => {
    // macos fullscreen spaces and hyprland tiling wm prohibit/ignore minimizing
    if (isWindowFullScreen || isHyprland) return;
    suppressStaleHover();
    useWindowAnimationStore.getState().triggerMinimize();
  };

  const handleMaximize = () => {
    window.linerElectron?.toggleMaximize();
  };

  const handleClose = () => {
    useWindowAnimationStore.getState().triggerClose();
  };

  const isDarkMode = isFullscreen;
  const isMinimizeDisabled = isWindowFullScreen || isHyprland;
  const hasCustomBg = useIsContentTransparent();
  const isGlass = hasCustomBg || variant === "glass";
  const fullscreenLabel = t(isWindowFullScreen ? "common.exitFullscreen" : "common.enterFullscreen");
  const toggleFullscreen = () => electron?.toggleFullScreen();
  const hasFullscreenButton = electron?.platform === "win32" && !isFullscreen;
  const exitFullscreenWithMaximize = isWindowFullScreen && !hasFullscreenButton;
  const maximizeDisabled = isWindowFullScreen && hasFullscreenButton;
  const maximizeLabel = exitFullscreenWithMaximize
    ? fullscreenLabel
    : t(isWindowMaximized ? "common.restore" : "common.maximize");

  if (!electron) return null;

  if (electron.platform === "darwin") {
    const buttons = [
      { label: t("common.close"), color: "#ff5f57", Icon: LuX, onClick: handleClose },
      { label: t("common.minimize"), color: "#febc2e", Icon: LuMinus, onClick: handleMinimize, disabled: isMinimizeDisabled },
      { label: fullscreenLabel, color: "#28c840", Icon: isWindowFullScreen ? LuMinimize2 : LuMaximize2, onClick: toggleFullscreen },
    ];
    return (
      <div
        data-keep-keyboard-focus
        style={style}
        className={`absolute top-[12px] z-[62] flex items-center gap-[3px] pointer-events-none select-none ${
          isFullscreen ? "right-[12px] h-[36px] pr-[12px]" : "left-[12px] h-[24px]"
        } ${className}`}
      >
        {buttons.map(({ label, color, Icon, onClick, disabled }) => (
          <button
            key={color}
            type="button"
            data-no-window-drag
            data-no-tooltip="true"
            title={label}
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            className="group pointer-events-auto grid h-[20px] w-[13px] place-items-center border-0 bg-transparent p-0 cursor-pointer disabled:opacity-35 disabled:cursor-default"
          >
            <span style={{ backgroundColor: color }} className="grid h-[12px] w-[12px] place-items-center rounded-full text-black/80">
              <Icon size={8} aria-hidden className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      data-keep-keyboard-focus
      style={style}
      className={`absolute top-[12px] right-[12px] z-[62] flex items-center justify-end pointer-events-none select-none ${className}`.trim()}
    >
      <div
        data-no-window-drag
        data-no-tooltip="true"
        data-window-controls
        className={`flex items-center h-[30px] min-h-[30px] max-h-[30px] box-border px-[2px] gap-0 rounded-lg pointer-events-auto transition-colors ${
          isFullscreen
            ? "lane-fs-window-controls text-white"
            : isGlass
              ? "apple-glass-pill text-text-primary"
              : isDarkMode
                ? "bg-black/50 text-white backdrop-blur-xl"
                : "bg-bg-panel/90 text-text-primary backdrop-blur-xl"
        }`}
      >
        {hasFullscreenButton && (
          <button
            type="button"
            onClick={toggleFullscreen}
            data-no-tooltip="true"
            title={fullscreenLabel}
            aria-label={fullscreenLabel}
            className="flex items-center justify-center w-[24px] h-[26px] rounded-md cursor-pointer border-none bg-transparent text-text-primary hover:bg-border-alpha-14 active:scale-95"
          >
            {isWindowFullScreen ? <LuMinimize2 size={12} /> : <LuMaximize2 size={12} />}
          </button>
        )}
        <button
          type="button"
          onClick={isMinimizeDisabled ? undefined : handleMinimize}
          disabled={isMinimizeDisabled}
          aria-disabled={isMinimizeDisabled}
          data-no-tooltip="true"
          title={t("common.minimize")}
          className={`flex items-center justify-center w-[24px] h-[26px] min-w-[24px] min-h-[26px] max-h-[26px] rounded-md border-none bg-transparent transition-colors ${
            isMinimizeDisabled
              ? "opacity-30 cursor-not-allowed pointer-events-none"
              : isFullscreen
                ? "text-white/80 hover:text-white hover:bg-white/10 active:scale-95 cursor-pointer"
                : isGlass
                  ? "text-text-primary hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 cursor-pointer"
                  : isDarkMode
                    ? "text-white/70 hover:text-white hover:bg-white/10 active:scale-95 cursor-pointer"
                    : "text-text-primary hover:bg-border-alpha-14 active:scale-95 cursor-pointer"
          }`}
          aria-label={t("common.minimize")}
        >
          <LuMinus size={13} />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          disabled={maximizeDisabled}
          data-no-tooltip="true"
          title={maximizeLabel}
          className={`flex items-center justify-center w-[24px] h-[26px] min-w-[24px] min-h-[26px] max-h-[26px] rounded-md cursor-pointer border-none bg-transparent transition-colors active:scale-95 ${
            maximizeDisabled
              ? "opacity-30 pointer-events-none"
              : isFullscreen
              ? "text-white/80 hover:text-white hover:bg-white/10"
              : isGlass
                ? "text-text-primary hover:bg-black/10 dark:hover:bg-white/10"
                : isDarkMode
                  ? "text-white/70 hover:text-white hover:bg-white/10"
                  : "text-text-primary hover:bg-border-alpha-14"
          }`}
          aria-label={maximizeLabel}
        >
          {exitFullscreenWithMaximize ? <LuMinimize2 size={12} /> : <LuSquare size={11} />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          data-no-tooltip="true"
          title={t("common.close")}
          className={`flex items-center justify-center w-[24px] h-[26px] min-w-[24px] min-h-[26px] max-h-[26px] rounded-md cursor-pointer border-none bg-transparent transition-colors hover:bg-[#E81123] hover:text-white active:scale-95 ${
            isFullscreen
              ? "text-white/80 hover:text-white hover:bg-[#E81123]"
              : isGlass
                ? "text-text-primary hover:bg-[#E81123]"
                : isDarkMode
                  ? "text-white/70 hover:text-white"
                  : "text-text-primary"
          }`}
          aria-label={t("common.close")}
        >
          <LuX size={13} />
        </button>
      </div>
    </div>
  );
}


