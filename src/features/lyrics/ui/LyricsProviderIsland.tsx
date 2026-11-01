import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckFill,
  DownLine,
} from "@mingcute/react";
import { useLyricsStore, hasSyncedLyricsSources } from "../store/lyricsStore";

export function LyricsProviderIsland() {
  const {
    availableProviders,
    activeProvider,
    selectProvider,
    braccatoLyrics,
    rawFormat,
  } = useLyricsStore();

  const [dropdownOpen, setDropdownOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dropdownOpen]);

  const hasSyncedSources = hasSyncedLyricsSources(
    availableProviders,
    braccatoLyrics,
    rawFormat,
  );

  if (
    availableProviders.length === 0 ||
    braccatoLyrics.length === 0 ||
    (!hasSyncedSources && availableProviders.length <= 1)
  ) {
    return null;
  }

  const currentIndex = Math.max(
    0,
    availableProviders.findIndex((p) => p.provider === activeProvider),
  );
  const currentProvider =
    availableProviders[currentIndex] ?? availableProviders[0];
  const hasMultiple = availableProviders.length > 1;

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center pointer-events-auto select-none"
    >
      <div className="inline-flex h-[32px] min-h-[32px] max-h-[32px] box-border items-center gap-[2px] rounded-[10px] border border-white/[0.08] bg-black/55 px-[3px] text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
        <button
          type="button"
          onClick={() => {
            if (hasMultiple) {
              setDropdownOpen((v) => !v);
            }
          }}
          className={`flex h-[26px] min-h-[26px] max-h-[26px] items-center gap-[6px] rounded-[7px] border-none bg-transparent px-[8px] text-[12px] font-[500] text-white transition-colors duration-150 ${
            hasMultiple
              ? "hover:bg-white/[0.12] active:bg-white/[0.16] cursor-pointer"
              : "cursor-default"
          }`}
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          <span className="truncate max-w-[120px]">
            {currentProvider.provider}
          </span>
          {hasMultiple && (
            <span className="text-[10px] font-mono text-white/50">
              {currentIndex + 1}/{availableProviders.length}
            </span>
          )}
          {hasMultiple && (
            <DownLine
              size={12}
              className={`text-white/50 transition-transform duration-150 ${
                dropdownOpen ? "rotate-180" : ""
              }`}
            />
          )}
        </button>

      </div>

      <AnimatePresence>
        {dropdownOpen && hasMultiple && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute top-full left-0 z-50 mt-[6px] flex min-w-[152px] flex-col gap-[4px] rounded-[12px] border border-white/[0.08] bg-black/40 p-[6px] text-white shadow-[0_12px_32px_rgba(0,0,0,0.38)] backdrop-blur-2xl"
          >
            {availableProviders.map((option) => {
              const isActive = option.provider === currentProvider.provider;
              return (
                <button
                  key={option.provider}
                  type="button"
                  onClick={() => {
                    selectProvider(option.provider);
                    setDropdownOpen(false);
                  }}
                  className={`flex min-h-[34px] w-full items-center justify-between gap-[8px] rounded-[8px] border-none px-[10px] py-[6px] text-left text-[12px] transition-colors duration-150 cursor-pointer ${
                    isActive
                      ? "bg-white/[0.12] text-white font-[500]"
                      : "bg-transparent text-white/70 hover:bg-white/[0.08] hover:text-white font-[400]"
                  }`}
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  <span className="truncate">{option.provider}</span>
                  {isActive ? (
                    <CheckFill
                      size={14}
                      className="text-white shrink-0"
                    />
                  ) : null}
                </button>
              );
            })}
          </motion.div>
        )}

        </AnimatePresence>
        {/*
        {offsetOpen && !isCurrentPlain && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute top-full right-0 mt-[6px] w-[260px] rounded-xl bg-black/80 backdrop-blur-2xl p-[12px] z-50 flex flex-col gap-[10px] text-white"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[6px]">
                <TimeLine size={14} className="text-white" />
                <span
                  className="text-[12px] font-[600] text-white"
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  {t("player.lyrics_offset")}
                </span>
              </div>
              {offsetMs !== 0 && (
                <button
                  type="button"
                  onClick={resetOffset}
                  className="inline-flex items-center gap-[4px] px-[6px] py-[2px] rounded-md text-[11px] font-[500] text-white/70 hover:text-white hover:bg-white/10 border-none bg-transparent cursor-pointer transition-colors"
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  <Refresh1Line size={11} />
                  <span>{t("player.reset")}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-[6px] bg-white/[0.06] rounded-lg p-[4px]">
              <button
                type="button"
                onClick={() => adjustOffset(unit === "ms" ? -50 : -100)}
                aria-label="Decrease offset"
                className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all border-none bg-transparent cursor-pointer shrink-0"
              >
                <MinimizeLine size={12} />
              </button>

              <div className="flex-1 flex items-center justify-center min-w-0">
                <input
                  type="text"
                  value={inputValue}
                  onFocus={() => {
                    isInputFocusedRef.current = true;
                  }}
                  onBlur={() => {
                    isInputFocusedRef.current = false;
                    if (unit === "ms") {
                      setInputValue(String(offsetMs));
                    } else {
                      setInputValue(String(offsetMs / 1000));
                    }
                  }}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      adjustOffset(unit === "ms" ? 50 : 100);
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      adjustOffset(unit === "ms" ? -50 : -100);
                    } else if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="0"
                  className="w-full text-center text-[13px] font-mono font-[600] text-white bg-transparent border-none outline-none p-0"
                />
              </div>

              <button
                type="button"
                onClick={() => adjustOffset(unit === "ms" ? 50 : 100)}
                aria-label="Increase offset"
                className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all border-none bg-transparent cursor-pointer shrink-0"
              >
                <AddLine size={12} />
              </button>

              <div className="flex items-center bg-white/10 rounded-md p-[2px] shrink-0">
                <button
                  type="button"
                  onClick={() => setUnit("ms")}
                  className={`px-[5px] py-[2px] text-[10px] font-mono rounded-[4px] border-none cursor-pointer transition-all ${
                    unit === "ms"
                      ? "bg-white/20 text-white font-[600]"
                      : "bg-transparent text-white/50 hover:text-white/80"
                  }`}
                >
                  ms
                </button>
                <button
                  type="button"
                  onClick={() => setUnit("s")}
                  className={`px-[5px] py-[2px] text-[10px] font-mono rounded-[4px] border-none cursor-pointer transition-all ${
                    unit === "s"
                      ? "bg-white/20 text-white font-[600]"
                      : "bg-transparent text-white/50 hover:text-white/80"
                  }`}
                >
                  s
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-[6px]">
              <div className="flex items-center justify-between text-[10px] font-[500] text-white/50 px-[2px]">
                <span>{t("player.earlier")} (-)</span>
                <span>{t("player.later")} (+)</span>
              </div>
              <div className="grid grid-cols-4 gap-[4px]">
                {[-1000, -500, -200, -100].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => adjustOffset(delta)}
                    className="py-[4px] text-[11px] font-mono rounded-md bg-white/[0.08] hover:bg-white/15 text-white/70 hover:text-white transition-all active:scale-95 text-center border-none cursor-pointer"
                  >
                    {delta / 1000}s
                  </button>
                ))}
                {[100, 200, 500, 1000].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => adjustOffset(delta)}
                    className="py-[4px] text-[11px] font-mono rounded-md bg-white/[0.08] hover:bg-white/15 text-white/70 hover:text-white transition-all active:scale-95 text-center border-none cursor-pointer"
                  >
                    +{delta / 1000}s
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
        */}
    </div>
  );
}

