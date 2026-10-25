import { useEffect, useMemo, useRef, useState } from "react";
import LikedCover from "@/features/library/ui/LikedCover";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftLine, DownLine, FolderOpenFill, HeartFill, RadioFill } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { api, toClientTrack } from "@/shared/api";
import { playerEngine } from "@/features/player";
import CoverImage from "@/features/covers/ui/CoverImage";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { usePlaylistsList } from "@/features/library/hooks/usePlaylists";
import { useSessionOwner } from "../hooks/sessionAwareLoad";
import { groupHistory, type HistoryGroup, type HistoryPlay } from "../history/groupHistory";

const PAGE = 100;

/** the listening history, page by page */
function useHistoryPlays() {
  const owner = useSessionOwner();
  const [plays, setPlays] = useState<HistoryPlay[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const run = useRef(0);
  const [filling, setFilling] = useState(false);

  // the first page shows at once; the rest of the days (3 whole days per
  // load, so each shown day has its total) streams in behind it
  const loadMore = async (from?: string) => {
    const token = ++run.current;
    setLoading(!from);
    setFilling(true);
    const dayOf = (iso: string) => new Date(iso).toDateString();
    const days = new Set<string>();
    let at = from;
    let next: string | null = null;
    try {
      for (let i = 0; i < 40; i++) {
        const page = await api.getHistory(at, i === 0 ? 50 : PAGE);
        if (token !== run.current) return;
        const batch: HistoryPlay[] = [];
        for (const item of page.items ?? []) {
          if (!item.track) continue;
          batch.push({
            track: toClientTrack(item.track),
            listenedAt: item.listenedAt,
            context: item.context,
            playedMs: item.playedDurationMs,
          });
          days.add(dayOf(item.listenedAt));
        }
        setPlays((prev) => (!from && i === 0 ? batch : [...prev, ...batch]));
        if (i === 0) setLoading(false);
        next = page.nextCursor ?? null;
        // keep the cursor current: the last day stays "incomplete" (no total) until its end is in
        setCursor(next ?? null);
        if (!next || days.size > 3) break;
        at = next;
      }
    } catch {
      if (token !== run.current) return;
      if (!from) setPlays([]);
      setCursor(null);
    } finally {
      if (token === run.current) {
        setLoading(false);
        setFilling(false);
      }
    }
  };

  useEffect(() => {
    void loadMore(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  return { plays, loading, hasMore: !!cursor, filling, more: () => cursor && !filling && void loadMore(cursor) };
}

export default function RecentPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const { plays, loading, hasMore, more } = useHistoryPlays();
  const { data: playlists } = usePlaylistsList();
  const days = useMemo(() => groupHistory(plays), [plays]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const tr = (key: string, fallback: string, vars?: Record<string, string | number>) => {
    const v = t(key, vars);
    return v && v !== key ? v : fallback;
  };
  const formatDuration = (ms: number) => {
    const minutes = Math.round(ms / 60_000);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? tr("history.hours_minutes", `${h} h ${m} min`, { h, m }) : tr("history.minutes", `${m} min`, { m });
  };

  const playlistById = useMemo(() => new Map((playlists?.playlists ?? []).map((p) => [p.id, p])), [playlists]);

  const dayLabel = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return t("history.today");
    if (date.toDateString() === yesterday.toDateString()) return t("history.yesterday");
    const label = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
    }).format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const describe = (g: HistoryGroup) => {
    const first = g.tracks[0];
    const count = t("history.songs_played", { count: g.tracks.length });
    switch (g.source) {
      case "playlist": {
        const p = g.id ? playlistById.get(g.id) : undefined;
        return { title: p?.title ?? t("history.playlist"), sub: `${count} · ${t("history.playlist")}`, cover: p?.coverUrl || first.coverUrl };
      }
      case "album":
        return { title: first.album?.title ?? first.title, sub: `${count} · ${t("history.album")}`, cover: first.coverUrl };
      case "liked":
        return { title: t("library.liked_songs"), sub: count, cover: undefined, icon: "liked" as const };
      case "mix":
        return { title: t("history.daily_mix"), sub: count, cover: first.coverUrl };
      case "vibe":
        return { title: t("home.vibe.title"), sub: count, cover: undefined, icon: "vibe" as const };
      case "radio":
        return { title: t("history.radio", { title: first.title }), sub: count, cover: first.coverUrl };
      default:
        // the day's lone tracks, gathered in one folder
        if (g.tracks.length > 1) return { title: tr("history.just_tracks", "Просто треки"), sub: count, cover: undefined, icon: "tracks" as const };
        return { title: first.title, sub: first.artists, cover: first.coverUrl };
    }
  };

  const openSource = (g: HistoryGroup) => {
    if (g.source === "playlist" && g.id) navigate(`/library/playlist?id=${encodeURIComponent(g.id)}`);
    else if (g.source === "liked") navigate("/library/playlist?id=likes");
    else if (g.source === "album" && g.id) navigate(`/collection?type=album&id=${encodeURIComponent(g.id)}`);
    else if (g.source === "mix" && g.id) navigate(`/collection?type=playlist&id=${encodeURIComponent(g.id)}`);
    else void playerEngine.playTrack(g.tracks[0], g.tracks, "recent", null, 0);
  };

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div data-page-scroller className="h-full w-full overflow-y-auto pb-[32px]" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
      <div className="px-[32px] pt-[52px]">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
          className="mb-[14px] inline-flex h-[32px] items-center gap-[6px] rounded-md border-0 bg-bg-panel/85 px-[10px] text-[13px] font-[500] text-text-primary cursor-pointer"
        >
          <ArrowLeftLine size={16} />
          {t("common.back")}
        </button>
        <h1 className="m-0 text-[26px] font-bold tracking-tight text-text-primary">{t("home.history")}</h1>
      </div>

      <div className="mt-[8px] px-[24px]">
        {days.map((day) => (
          <section key={day.key} className="mt-[22px]">
            <h2 className="m-0 mb-[8px] flex items-baseline gap-[10px] px-[8px] text-[18px] font-[700] tracking-tight text-text-primary">
              {dayLabel(day.date)}
              {/* the oldest day may be cut off by paging: no total for it */}
              {(!hasMore || day !== days[days.length - 1]) && (
                <span className="text-[13px] font-[500] text-text-tertiary tabular-nums">
                  {formatDuration(day.playedMs)} · {t("history.tracks_count", { count: day.plays })}
                </span>
              )}
            </h2>
            <div className="flex flex-col">
              {day.groups.map((g) => {
                const d = describe(g);
                const expandable = g.tracks.length > 1;
                const isOpen = open.has(g.key);
                return (
                  <div key={g.key} className="lane-row rounded-xl transition-colors hover:bg-white/[0.035]">
                    <div className="flex items-center gap-[12px] px-[8px] py-[7px]">
                      <button
                        type="button"
                        onClick={() => openSource(g)}
                        className="flex min-w-0 flex-1 items-center gap-[12px] border-0 bg-transparent p-0 text-left cursor-pointer"
                      >
                        <span className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-md bg-border-alpha-14">
                          {d.icon === "liked" ? (
                            <LikedCover heartRatio={0.5} />
                          ) : d.icon === "vibe" ? (
                            <span className="flex h-full w-full items-center justify-center text-white" style={{ background: "radial-gradient(circle at 50% 50%, #111 38%, #d22ad2 70%, #6a0f96)" }}>
                              <RadioFill size={20} />
                            </span>
                          ) : d.icon === "tracks" ? (
                            // the day's loose tracks: a folder of its own
                            <span className="flex h-full w-full items-center justify-center text-white" style={{ background: "linear-gradient(145deg, #3b82f6, #1e3a8a)" }}>
                              <FolderOpenFill size={22} />
                            </span>
                          ) : d.cover ? (
                            <CoverImage src={d.cover} alt="" fill sizes="52px" className="object-cover" />
                          ) : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-[550] text-text-primary">{d.title}</span>
                          <span className="block truncate text-[13px] text-text-tertiary">{d.sub}</span>
                        </span>
                      </button>
                      {expandable && (
                        <button
                          type="button"
                          onClick={() => toggle(g.key)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? t("history.collapse") : t("history.expand")}
                          className="inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-text-tertiary hover:bg-white/[0.06] hover:text-text-primary cursor-pointer"
                        >
                          <DownLine size={20} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                        </button>
                      )}
                    </div>
                    <AnimatePresence initial={false}>
                      {expandable && isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden pl-[20px] pb-[6px]"
                        >
                          {g.tracks.map((track, index) => (
                            <SongCardWithMenu
                              key={`${track.id}-${index}`}
                              id={track.id}
                              title={track.title}
                              artists={track.artists}
                              coverUrl={track.coverUrl ?? ""}
                              durationMs={track.durationMs}
                              explicit={track.explicit}
                              onPlay={() => void playerEngine.playTrack(track, g.tracks, "recent", null, index)}
                              searchType="track"
                            />
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {!loading && days.length === 0 && (
          <p className="mt-[40px] text-center text-[14px] text-text-tertiary">{t("history.empty")}</p>
        )}
        {hasMore && (
          <div className="mt-[18px] flex justify-center">
            <button
              type="button"
              onClick={more}
              disabled={loading}
              className="h-[38px] rounded-full border border-white/10 bg-white/[0.05] px-[18px] text-[13.5px] font-[550] text-text-primary hover:bg-white/[0.09] disabled:opacity-50 cursor-pointer"
            >
              {loading ? "…" : t("history.more")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
