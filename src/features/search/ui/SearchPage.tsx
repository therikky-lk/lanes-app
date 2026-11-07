import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CloseLine, SearchLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { mediaUrl, toClientTrack, toMaxQualityAvatarUrl } from "@/shared/api";
import { playerEngine } from "@/features/player";
import Button from "@/shared/ui/Button";
import { debouncedStorage } from "@/shared/utils/storage";
import { useLibrarySearch } from "../hooks/useLibrarySearch";
import { usePageSearch, type PageSearchFilter } from "../hooks/usePageSearch";
import { useSearchPageStore } from "../store/searchPageStore";
import { useSearchHistoryStore } from "../store/searchHistoryStore";
import RecommendedArtists from "./RecommendedArtists";
import SearchResultsList from "./SearchResultsList";
import SearchHistoryList from "./SearchHistoryList";

const filters: [PageSearchFilter, string][] = [["all", "common.all"], ["library", "search.library"], ["track", "common.songs"], ["youtube", "search.youtube"], ["artist", "common.artists"], ["album", "common.albums"], ["playlist", "common.playlists"]];

function displayItem(item: any) {
  const coverUrl = item.cover ? mediaUrl(item.cover.url) : item.coverUrl ?? "";
  if (item.type === "track") return { ...item, ...toClientTrack(item), _type: "track" };
  return {
    ...item, _type: item.type, title: item.title ?? item.name,
    coverUrl: item.type === "artist" ? toMaxQualityAvatarUrl(coverUrl) : coverUrl,
    artists: Array.isArray(item.artists) ? item.artists.map((artist: any) => artist.name).join(", ") : item.artists ?? item.artist ?? item.author ?? item.owner ?? "",
  };
}

/** Search owns its input and results; typing never rerenders the app shell. */
export default function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { query, filter, setQuery, setFilter } = useSearchPageStore();
  const historyCount = useSearchHistoryStore((state) => state.items.length);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchParams.get("focus") !== "1") return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [searchParams]);
  const addHistory = useSearchHistoryStore((state) => state.addItem);
  const deferredQuery = useDeferredValue(query);
  const search = usePageSearch(query, filter);
  const local = useLibrarySearch(deferredQuery, (filter === "all" || filter === "library") && deferredQuery.trim().length >= 2);
  const hasQuery = query.trim().length > 0;
  const results = useMemo(() => {
    const catalog = search.items.map(displayItem);
    if (filter === "library") return local;
    if (filter !== "all") return catalog;
    const seen = new Set(local.map((item) => `${item._type}:${item.id}`));
    return [...local, ...catalog.filter((item) => !seen.has(`${item._type}:${item.id}`))];
  }, [search.items, local, filter]);

  const rememberQuery = useCallback((value: string) => {
    const title = value.trim();
    if (title.length < 2) return;
    addHistory({ id: `query:${title.toLowerCase()}`, type: "query", title });
  }, [addHistory]);

  // Keep completed searches even when the keyboard's Search key wasn't pressed.
  useEffect(() => {
    if (query.trim().length < 2 || search.loading || search.error) return;
    const timer = setTimeout(() => rememberQuery(query), 500);
    return () => clearTimeout(timer);
  }, [query, search.loading, search.error, rememberQuery]);
  useEffect(() => () => debouncedStorage.flush(), []);

  const play = useCallback((track: any) => {
    input.current?.blur();
    playerEngine.primeUserGesture();
    rememberQuery(useSearchPageStore.getState().query);
    const { _queue, _context, ...plain } = track;
    addHistory({ id: track.id, type: "track", title: track.title, subtitle: track.artists, coverUrl: track.coverUrl, durationMs: track.durationMs, explicit: track.explicit, itemData: plain });
    void playerEngine.playTrack(plain, _queue?.length ? _queue : [plain], _context ?? `${track.title} Radio`, track.coverUrl);
  }, [addHistory, rememberQuery]);

  const open = useCallback((item: any) => {
    input.current?.blur();
    rememberQuery(useSearchPageStore.getState().query);
    const type = item._type ?? item.type;
    addHistory({ id: item.id, type: type === "artist" ? "artist" : type === "album" ? "album" : "playlist", title: item.title ?? item.name, subtitle: item.artists, coverUrl: item.coverUrl, itemData: item });
    navigate(item._href ?? (type === "artist" ? `/artist?id=${encodeURIComponent(item.id)}` : `/collection?type=${type === "album" ? "album" : "playlist"}&id=${encodeURIComponent(item.id)}`));
  }, [navigate, addHistory, rememberQuery]);

  const rememberArtist = useCallback((artist: { id: string; name: string }) => {
    input.current?.blur();
    rememberQuery(useSearchPageStore.getState().query);
    addHistory({ id: artist.id, type: "artist", title: artist.name, itemData: { ...artist, title: artist.name, _type: "artist" } });
  }, [addHistory, rememberQuery]);

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-bg-primary" style={{ paddingTop: "calc(var(--lane-safe-top, 0px) + 12px)", paddingBottom: "var(--lane-dock-h, 120px)", fontFamily: "var(--font-inter), sans-serif" }}>
      <header className="shrink-0 px-[16px] pb-[10px]">
        <h1 className="m-0 mb-[14px] text-[26px] font-bold text-text-primary">{t("common.search")}</h1>
        <form className="flex h-[48px] items-center gap-[10px] rounded-[12px] bg-bg-panel px-[12px]" role="search" onSubmit={(event) => { event.preventDefault(); rememberQuery(query); void search.runNow(); input.current?.blur(); }}>
          {search.loading ? <span role="status" aria-label={t("common.loading")} className="h-[20px] w-[20px] shrink-0 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" /> : <SearchLine size={21} className="shrink-0 text-text-secondary" />}
          <input ref={input} type="search" enterKeyHint="search" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-label={t("common.search")} placeholder={t("search.placeholder")} value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-text-primary outline-none [&::-webkit-search-cancel-button]:hidden" />
          {hasQuery && <button type="button" aria-label={t("common.clear_search")} className="flex h-[36px] w-[36px] shrink-0 items-center justify-center border-0 bg-transparent text-text-secondary" onClick={() => { setQuery(""); input.current?.focus(); }}><CloseLine size={20} /></button>}
        </form>
        <div className="mt-[12px] flex gap-[6px] overflow-x-auto pb-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={t("common.search")}>
          {filters.map(([key, label]) => <button key={key} type="button" aria-pressed={key === filter} onClick={() => setFilter(key)} className={`h-[32px] shrink-0 rounded-[10px] border-0 px-[12px] text-[13px] ${key === filter ? "bg-text-primary text-bg-primary" : "bg-bg-panel text-text-secondary"}`}>{t(label)}</button>)}
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        {!hasQuery ? <div className="h-full overflow-y-auto">
          {historyCount > 0 && <SearchHistoryList onSelectQuery={(value) => { setQuery(value); rememberQuery(value); input.current?.blur(); }} onPlayTrack={play} onNavigateItem={open} onOpenArtist={rememberArtist} />}
          <RecommendedArtists />
        </div> : query.trim().length < 2 ? null : <>
          {results.length > 0 ? <SearchResultsList items={results} isArtistSearchFilter={filter === "artist"} isPlaylistSearchFilter={filter === "playlist"} onPlayFromSearch={play} onNavigateItem={open} onOpenArtist={rememberArtist} /> : !search.loading && <div className="flex h-full flex-col items-center justify-center gap-[12px] px-[24px] text-center text-text-secondary"><p>{search.error ? t("common.error_network") : t("common.no_results")}</p>{search.error && <Button variant="secondary" onClick={() => void search.runNow()}><SearchLine size={18} />{t("common.search")}</Button>}</div>}
        </>}
      </div>
    </section>
  );
}
