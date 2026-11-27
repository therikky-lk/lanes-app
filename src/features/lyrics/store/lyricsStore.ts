import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { debouncedStorage } from "@/shared/utils/storage";
import {
  parseRawLyrics,
  applyLyricsOffset,
  type WordData,
  type SyncedLine,
} from "../engine/lyricsParser";
import type { Lyric } from "@braccato/parsers";
import type { LyricsCandidate, LyricsSyncLevel } from "@/shared/contracts/lyrics";

export interface LyricsProviderOption {
  provider: string;
  syncLevel: LyricsSyncLevel;
  quality: number;
  candidate: LyricsCandidate;
}

export type LyricsDisplayMode = "source" | "karaoke";

export function hasSyncedLyricsSources(
  availableProviders: LyricsProviderOption[] = [],
  braccatoLyrics: Lyric[] = [],
  rawFormat: string | null = null,
): boolean {
  if (
    availableProviders.some(
      (p) =>
        (p.syncLevel && p.syncLevel !== "plain") ||
        (p.candidate?.syncLevel && p.candidate.syncLevel !== "plain") ||
        (p.candidate?.lyrics?.format && p.candidate.lyrics.format !== "plain") ||
        (p.candidate?.contentKind && p.candidate.contentKind !== "plain") ||
        (p.candidate?.syncHint && p.candidate.syncHint !== "plain"),
    )
  ) {
    return true;
  }
  if (
    braccatoLyrics.length > 0 &&
    braccatoLyrics.some((l) => (l.startTimeMs ?? 0) > 0 || (l.durationMs ?? 0) > 0)
  ) {
    return true;
  }
  if (rawFormat !== null && rawFormat !== "plain") {
    return true;
  }
  return false;
}

export interface LyricsState {
  lyricsLoading: boolean;
  lyricsError: string | null;
  rawLyrics: string | null;
  rawFormat: string | null;
  baseBraccatoLyrics: Lyric[];
  baseSyncedLines: SyncedLine[];
  braccatoLyrics: Lyric[];
  syncedLines: SyncedLine[];
  plainLyrics: string | null;
  lyricsQuality: number;
  currentLyricsTrackId: string | null;
  activeProvider: string | null;
  availableProviders: LyricsProviderOption[];
  displayMode: LyricsDisplayMode;
  offsetMs: number;
  trackOffsets: Record<string, number>;
  activeLineIndex: number | null;

  setLyricsState: (
    state: Partial<
      Omit<
        LyricsState,
        | "setLyricsState"
        | "reset"
        | "selectProvider"
        | "selectKaraoke"
        | "setOffset"
        | "adjustOffset"
        | "resetOffset"
        | "setActiveLineIndex"
      >
    >,
  ) => void;
  setActiveLineIndex: (index: number | null) => void;
  selectProvider: (providerName: string, mode?: LyricsDisplayMode) => void;
  selectKaraoke: () => void;
  setOffset: (offsetMs: number) => void;
  adjustOffset: (deltaMs: number) => void;
  resetOffset: () => void;
  reset: () => void;
}

const LYRICS_SESSION_STORAGE_KEY = "liner_lyrics_session_v1";

export const useLyricsStore = create<LyricsState>()(
  persist(
    (set, get) => ({
      lyricsLoading: false,
      lyricsError: null,
      rawLyrics: null,
      rawFormat: null,
      baseBraccatoLyrics: [],
      baseSyncedLines: [],
      braccatoLyrics: [],
      syncedLines: [],
      plainLyrics: null,
      lyricsQuality: 0,
      currentLyricsTrackId: null,
      activeProvider: null,
      availableProviders: [],
      displayMode: "karaoke",
      offsetMs: 0,
      trackOffsets: {},
      activeLineIndex: null,

      setActiveLineIndex: (index) => {
        if (get().activeLineIndex === index) return;
        set({ activeLineIndex: index });
      },

      setLyricsState: (state) => {
        const current = get();
        const nextTrackId =
          state.currentLyricsTrackId !== undefined
            ? state.currentLyricsTrackId
            : current.currentLyricsTrackId;
        const isNewTrack =
          state.currentLyricsTrackId !== undefined &&
          state.currentLyricsTrackId !== current.currentLyricsTrackId;

        const offset =
          state.offsetMs !== undefined
            ? state.offsetMs
            : isNewTrack
              ? nextTrackId && current.trackOffsets?.[nextTrackId]
                ? current.trackOffsets[nextTrackId]
                : 0
              : current.offsetMs;

        let baseBraccato =
          state.baseBraccatoLyrics ??
          state.braccatoLyrics ??
          (isNewTrack ? [] : current.baseBraccatoLyrics);
        let baseSynced =
          state.baseSyncedLines ??
          state.syncedLines ??
          (isNewTrack ? [] : current.baseSyncedLines);

        const adjusted = applyLyricsOffset(
          { braccatoLyrics: baseBraccato, syncedLines: baseSynced },
          offset,
        );

        set({
          ...(isNewTrack ? { displayMode: "karaoke" } : {}),
          ...state,
          offsetMs: offset,
          baseBraccatoLyrics: baseBraccato,
          baseSyncedLines: baseSynced,
          braccatoLyrics: adjusted.braccatoLyrics,
          syncedLines: adjusted.syncedLines,
        });
      },

      selectKaraoke: () => {
        const { activeProvider, availableProviders, selectProvider } = get();
        const timed = availableProviders.filter(option => hasSyncedLyricsSources([option]));
        const choice = timed.find(option => option.provider === activeProvider) ?? timed[0];
        if (choice) selectProvider(choice.provider, "karaoke");
      },

      selectProvider: (providerName, displayMode = "source") => {
        const { activeProvider, availableProviders, offsetMs } = get();
        const option = availableProviders.find((p) => p.provider === providerName);
        if (!option) return;
        if (activeProvider === providerName) {
          set({ displayMode });
          return;
        }

        try {
          const parsed = parseRawLyrics(
            option.candidate.lyrics.content,
            option.candidate.lyrics.format,
          );

          const adjusted = applyLyricsOffset(
            { braccatoLyrics: parsed.braccatoLyrics, syncedLines: parsed.syncedLines },
            offsetMs,
          );

          set({
            activeProvider: option.provider,
            displayMode,
            rawLyrics: option.candidate.lyrics.content,
            rawFormat: option.candidate.lyrics.format,
            baseBraccatoLyrics: parsed.braccatoLyrics,
            baseSyncedLines: parsed.syncedLines,
            braccatoLyrics: adjusted.braccatoLyrics,
            syncedLines: adjusted.syncedLines,
            plainLyrics: parsed.plainLyrics,
            lyricsQuality: option.quality,
          });
        } catch {
          set({
            activeProvider: option.provider,
            displayMode,
            rawLyrics: option.candidate.lyrics.content,
            rawFormat: option.candidate.lyrics.format,
            baseBraccatoLyrics: [],
            baseSyncedLines: [],
            braccatoLyrics: [],
            syncedLines: [],
            plainLyrics: option.candidate.lyrics.content,
            lyricsQuality: option.quality,
          });
        }
      },

      setOffset: (offsetMs: number) => {
        if (get().offsetMs === offsetMs) return;
        const {
          baseBraccatoLyrics,
          baseSyncedLines,
          currentLyricsTrackId,
          trackOffsets,
        } = get();

        const adjusted = applyLyricsOffset(
          { braccatoLyrics: baseBraccatoLyrics, syncedLines: baseSyncedLines },
          offsetMs,
        );

        const updatedTrackOffsets = { ...(trackOffsets || {}) };
        if (currentLyricsTrackId) {
          if (offsetMs === 0) {
            delete updatedTrackOffsets[currentLyricsTrackId];
          } else {
            updatedTrackOffsets[currentLyricsTrackId] = offsetMs;
          }
        }

        set({
          offsetMs,
          braccatoLyrics: adjusted.braccatoLyrics,
          syncedLines: adjusted.syncedLines,
          trackOffsets: updatedTrackOffsets,
        });
      },

      adjustOffset: (deltaMs: number) => {
        const { offsetMs, setOffset } = get();
        setOffset(offsetMs + deltaMs);
      },

      resetOffset: () => {
        get().setOffset(0);
      },

      reset: () =>
        set({
          lyricsLoading: false,
          lyricsError: null,
          rawLyrics: null,
          rawFormat: null,
          baseBraccatoLyrics: [],
          baseSyncedLines: [],
          braccatoLyrics: [],
          syncedLines: [],
          plainLyrics: null,
          lyricsQuality: 0,
          currentLyricsTrackId: null,
          activeProvider: null,
          availableProviders: [],
          displayMode: "karaoke",
          offsetMs: 0,
          activeLineIndex: null,
        }),
    }),
    {
      name: LYRICS_SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => debouncedStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.lyricsLoading = false;
          state.lyricsError = null;
          state.displayMode = "karaoke";
          if (!state.trackOffsets) {
            state.trackOffsets = {};
          }
        }
      },
      partialize: (state) => ({
        currentLyricsTrackId: state.currentLyricsTrackId,
        trackOffsets: state.trackOffsets,
      }),
    },
  ),
);
