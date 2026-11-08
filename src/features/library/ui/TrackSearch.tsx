import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search2Line } from "@mingcute/react";
import { useTranslation } from "@/languages";
import Button from "@/shared/ui/Button";
import { isMacPlatform } from "@/features/shortcuts";
import { isBlockingOverlayOpen } from "@/features/navigation/utils/shortcutGuards";
import {
  filterTracks,
  type SearchableTrack,
  type TrackMatch,
} from "@/shared/utils/trackSearch";

// In-page search for track lists (playlists, albums, mixes, liked songs).
// It only filters what is shown: playback, Play all, Shuffle and Add to queue
// keep using the full list, so starting a track from the results still plays
// the whole playlist from there.

export interface TrackSearchState<T> {
  isOpen: boolean;
  query: string;
  /** trimmed, deferred query the results were computed for ("" = not filtering) */
  activeQuery: string;
  /** null while not filtering */
  matches: TrackMatch<T>[] | null;
  focusToken: number;
  setQuery: (q: string) => void;
  open: () => void;
  close: () => void;
  /** search button: hides an open field, opens a closed one */
  toggle: () => void;
}

export function TrackSearchButton({
  search,
  disabled = false,
  glass = false,
  className = "",
}: {
  search: Pick<TrackSearchState<unknown>, "isOpen" | "toggle">;
  disabled?: boolean;
  glass?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = useTrackSearchButtonLabel();
  return (
    <Button
      variant={search.isOpen ? "primary" : glass ? "glass-action" : "outline"}
      size="icon"
      className={`!h-[36px] !w-[36px] shrink-0 !p-0 ${className}`}
      disabled={disabled}
      aria-label={t("common.search")}
      title={label || t("common.search")}
      aria-expanded={search.isOpen}
      onPointerDown={(event) => event.preventDefault()}
      onClick={search.toggle}
    >
      <Search2Line size={16} />
    </Button>
  );
}

export function useTrackSearch<T extends SearchableTrack>(
  tracks: readonly T[],
  /** search resets when this changes (e.g. the playlist id) */
  resetKey: unknown,
): TrackSearchState<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusToken, setFocusToken] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const activeQuery = deferredQuery.trim();

  useEffect(() => {
    setIsOpen(false);
    setQuery("");
  }, [resetKey]);

  const matches = useMemo(
    () => (activeQuery ? filterTracks(tracks, activeQuery) : null),
    [tracks, activeQuery],
  );

  const open = useCallback(() => {
    setIsOpen(true);
    setFocusToken((n) => n + 1);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  // ctrl/cmd+f opens (or re-focuses) the search, like find-in-page everywhere else
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyF" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (isBlockingOverlayOpen()) return;
      e.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const toggle = useCallback(() => {
    if (isOpen) close();
    else open();
  }, [isOpen, open, close]);

  return { isOpen, query, activeQuery, matches, focusToken, setQuery, open, close, toggle };
}

interface TrackSearchFieldProps {
  search: TrackSearchState<unknown>;
  totalCount: number;
  placeholder: string;
  glass?: boolean;
  /** Enter: play the first result */
  onSubmit?: () => void;
  className?: string;
  /** Expand horizontally from the trigger when shown in a compact action row. */
  expandOnOpen?: boolean;
  expandWidth?: number;
  closeOnBlur?: boolean;
}

export const TrackSearchField = memo(function TrackSearchField({
  search,
  totalCount,
  placeholder,
  glass = false,
  onSubmit,
  className = "",
  expandOnOpen = false,
  expandWidth = 220,
  closeOnBlur = true,
}: TrackSearchFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const { isOpen, query, setQuery, close, focusToken, matches } = search;

  useEffect(() => {
    if (!isOpen || focusToken === 0) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [isOpen, focusToken]);

  const hasQuery = query.trim().length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="track-search"
          role="search"
          initial={expandOnOpen ? { opacity: 0, width: 0, x: 0 } : { opacity: 0, y: -4 }}
          animate={expandOnOpen ? { opacity: 1, width: expandWidth, x: 0 } : { opacity: 1, y: 0 }}
          exit={expandOnOpen ? { opacity: 0, width: 0, x: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: expandOnOpen ? 0.2 : 0.14, ease: [0.22, 1, 0.36, 1] }}
          layout={expandOnOpen}
          data-no-window-drag
          className={`flex ${expandOnOpen ? "h-[36px] overflow-hidden rounded-[10px]" : "h-[32px] w-[300px] rounded-md"} items-center gap-[8px] px-[10px] pointer-events-auto ${
            glass
              ? "apple-glass-pill !border-none"
              : "bg-bg-panel/85 backdrop-blur-xl text-text-primary"
          } ${className}`}
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          <Search2Line
            size={15}
            className={`shrink-0 ${glass ? "text-white/70" : "text-text-tertiary"}`}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder={placeholder}
            aria-label={placeholder}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                // handled here so the app-wide Escape (back / close panels) stands down
                e.preventDefault();
                e.stopPropagation();
                if (query) setQuery("");
                else close();
              } else if (e.key === "Enter") {
                e.preventDefault();
                onSubmit?.();
              }
            }}
            onBlur={() => {
              if (closeOnBlur && !query.trim()) close();
            }}
            className={`min-w-0 flex-1 border-none bg-transparent p-0 text-[13px] font-[400] outline-none ${
              glass
                ? "text-white placeholder:text-white/55"
                : "text-text-primary placeholder:text-text-tertiary"
            }`}
          />
          {hasQuery && matches && (
            <span
              className={`shrink-0 text-[12px] tabular-nums select-none ${
                glass ? "text-white/60" : "text-text-tertiary"
              }`}
              aria-live="polite"
            >
              {t("track_search.count", { count: matches.length, total: totalCount })}
            </span>
          )}


        </motion.div>
      )}
    </AnimatePresence>
  );
});

/** Tooltip text for the search button, with the platform shortcut. */
export function useTrackSearchButtonLabel(): string {
  const { t } = useTranslation();
  return `${t("track_search.button")} (${isMacPlatform() ? "⌘F" : "Ctrl+F"})`;
}

export const TrackSearchEmpty = memo(function TrackSearchEmpty({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-[10px] text-center select-none"
      style={{ fontFamily: "var(--font-inter), sans-serif" }}
    >
      <Search2Line size={32} className="text-text-tertiary/70" />
      <p className="m-0 max-w-[360px] truncate text-[14px] font-[500] text-text-primary">
        {t("track_search.no_results", { query })}
      </p>
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-text-tertiary transition-colors hover:text-text-primary"
      >
        {t("track_search.clear")}
      </button>
    </div>
  );
});
