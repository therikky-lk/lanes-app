import { useEffect, useRef, useState } from "react";
import SegmentedTabs from "@/shared/ui/SegmentedTabs";
import { FireFill } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { playerEngine, usePlayerStore } from "@/features/player";
import CoverImage from "@/features/covers/ui/CoverImage";
import { loadChart, resolveSong, type ChartEntry, type ChartRegion, type Movement } from "../trends/charts";
import type { Track } from "@/shared/types/track";

const PREVIEW = 10;

function formatDuration(durationMs: number | undefined): string | null {
  if (!durationMs || durationMs <= 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** the little sign under a rank: crown for #1, otherwise how the song moved */
function RankMark({ rank, movement }: { rank: number; movement: Movement }) {
  if (rank === 1) {
    return (
      <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" className="text-[#f6c544]">
        <path d="M1 3.2 4 6l3-4.6L10 6l3-2.8-1.3 6.8H2.3L1 3.2Z" fill="currentColor" />
        <rect x="2.3" y="10.4" width="9.4" height="1.4" rx="0.7" fill="currentColor" />
      </svg>
    );
  }
  if (movement === "up" || movement === "new") {
    return (
      <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" className="text-[#2bd46b]">
        <path d="M1 8.5 5 4.5l2.5 2.5L12.5 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.2 1.6h3.6v3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (movement === "down") {
    return (
      <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" className="text-[#ff4d5e]">
        <path d="M1 1.5 5 5.5l2.5-2.5L12.5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.2 8.4h3.6V4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return <span className="block h-[2px] w-[9px] rounded-full bg-text-tertiary/70" aria-hidden="true" />;
}

export default function TrendsSection() {
  const { t } = useTranslation();
  const [region, setRegion] = useState<ChartRegion>(() => {
    try {
      return localStorage.getItem("lane_trends_region") === "world" ? "world" : "russia";
    } catch {
      return "russia";
    }
  });
  const [entries, setEntries] = useState<ChartEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);
  const currentId = usePlayerStore((s) => s.currentTrack?.id);
  const [opening, setOpening] = useState<string | null>(null);
  const entriesRef = useRef<ChartEntry[] | null>(null);
  entriesRef.current = entries;

  const setTrack = (songId: string, track: Track | null) =>
    setEntries((prev) => prev?.map((e) => (e.song.id === songId ? { ...e, track: track ?? undefined } : e)) ?? prev);

  // find the shown songs on YouTube Music in the background, top first, a
  // couple at a time; stops quietly when YouTube asks to slow down
  useEffect(() => {
    if (!entries) return;
    const wanted = (all ? entries : entries.slice(0, PREVIEW)).filter((e) => !e.track).map((e) => e.song);
    if (wanted.length === 0) return;
    const ctrl = new AbortController();
    let cursor = 0;
    const worker = async () => {
      while (cursor < wanted.length && !ctrl.signal.aborted) {
        const song = wanted[cursor++];
        try {
          setTrack(song.id, await resolveSong(song, ctrl.signal));
        } catch {
          return;
        }
      }
    };
    void Promise.all([worker(), worker()]);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries === null, region, all]);

  const play = async (e: ChartEntry) => {
    let track = e.track;
    if (!track) {
      setOpening(e.song.id);
      track = (await resolveSong(e.song).catch(() => null)) ?? undefined;
      setOpening(null);
      setTrack(e.song.id, track ?? null);
      if (!track) return;
    }
    // the queue: the chart from here on, with what's already found
    const list = (entriesRef.current ?? []).filter((x) => x.rank >= e.rank);
    const queue = list.map((x) => (x.song.id === e.song.id ? track : x.track)).filter((x): x is Track => Boolean(x));
    void playerEngine.playTrack(track, queue, `trends:${region}`, null, 0);
  };

  useEffect(() => {
    let active = true;
    setEntries(null);
    setFailed(false);
    setAll(false);
    loadChart(region)
      .then((list) => active && setEntries(list))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [region]);

  const pick = (r: ChartRegion) => {
    setRegion(r);
    try {
      localStorage.setItem("lane_trends_region", r);
    } catch {}
  };

  if (failed) return null;
  const shown = entries ? (all ? entries : entries.slice(0, PREVIEW)) : [];
  return (
    <div className="flex flex-col" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
      <div className="mt-[26px] px-[16px] md:px-8 flex items-center justify-between gap-[12px]">
        <div className="flex items-center gap-2.5">
          <FireFill className="w-5 h-5 text-[#ff6a3d]" />
          <h2 className="text-text-primary text-[21px] font-semibold m-0 leading-tight tracking-tight">{t("trends.title")}</h2>
        </div>
        {/* the same switch as in the library */}
        <SegmentedTabs
          value={region}
          onChange={pick}
          options={[
            { id: "russia" as const, label: t("trends.russia") },
            { id: "world" as const, label: t("trends.world") },
          ]}
        />
      </div>

      <div className="mt-[10px] grid grid-cols-1 gap-x-[16px] px-[24px] md:grid-cols-2">
        {entries === null
          ? Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex h-[60px] items-center gap-[12px] px-[8px]">
                <span className="h-[44px] w-[44px] animate-pulse rounded-md bg-border-alpha-14" />
                <span className="h-[12px] w-[50%] animate-pulse rounded bg-border-alpha-14" />
              </div>
            ))
          : shown.map((e) => (
              <button
                key={e.song.id}
                type="button"
                onClick={() => void play(e)}
                className="group flex h-[60px] min-w-0 items-center gap-[12px] rounded-lg border-0 bg-transparent px-[8px] text-left cursor-pointer transition-colors hover:bg-white/[0.05]"
              >
                <span className="flex w-[26px] shrink-0 flex-col items-center justify-center gap-[3px]">
                  <span className={`text-[15px] font-[700] tabular-nums leading-none ${(e.track && currentId === e.track.id) ? "text-accent-primary" : "text-text-primary"}`}>
                    {e.rank}
                  </span>
                  <RankMark rank={e.rank} movement={e.movement} />
                </span>
                <span className="relative h-[44px] w-[44px] shrink-0 overflow-hidden rounded-md bg-border-alpha-14">
                  {(e.song.coverUrl || e.track?.coverUrl) && (
                    <CoverImage src={e.song.coverUrl || e.track!.coverUrl} alt="" fill sizes="44px" className="object-cover" />
                  )}
                  {opening === e.song.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="h-[16px] w-[16px] animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    </span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-[14.5px] font-[550] ${(e.track && currentId === e.track.id) ? "text-accent-primary" : "text-text-primary"}`}>
                    {e.song.title}
                  </span>
                  <span className="flex min-w-0 items-center gap-[5px] truncate text-[12.5px] text-text-tertiary">
                    <span className="truncate">{e.song.artist}</span>
                    {formatDuration(e.track?.durationMs) && (
                      <>
                        <span className="shrink-0 text-text-tertiary/60">·</span>
                        <span className="shrink-0 tabular-nums text-text-tertiary">
                          {formatDuration(e.track?.durationMs)}
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </button>
            ))}
      </div>

      {entries && entries.length > PREVIEW && (
        <div className="mt-[6px] px-8">
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            className="h-[34px] rounded-full border border-white/10 bg-white/[0.04] px-[16px] text-[13px] font-[550] text-text-primary hover:bg-white/[0.08] cursor-pointer"
          >
            {all ? t("trends.less") : t("trends.all", { n: entries.length })}
          </button>
        </div>
      )}
    </div>
  );
}
