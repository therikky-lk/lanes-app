import PhoneMenu, { PhoneMenuDivider, PhoneMenuItem } from "@/shared/ui/PhoneMenu";
import { onAndroidBack } from "@/shared/platform/androidBack";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftLine, CheckLine, CloseLine, GridLine, MenuLine, More2Fill } from "@mingcute/react";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import AlbumCard from "@/features/collection/ui/AlbumCard";
import ReleaseCard from "@/features/collection/ui/ReleaseCard";
import CoverImage from "@/features/covers/ui/CoverImage";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import SegmentedTabs from "@/shared/ui/SegmentedTabs";
import { useTranslation } from "@/languages";
import type { ArtistAlbumViewModel, ArtistReleaseViewModel } from "../hooks/useArtist";

export type ReleaseFilter = "all" | "albums" | "singles";
type ViewMode = "grid" | "list";

const VIEW_KEY = "lane_artist_releases_view";

interface Item {
  release: ArtistAlbumViewModel;
  kind: "album" | "single" | "ep";
}

export interface ArtistReleasesViewProps {
  open: boolean;
  artistName: string;
  albums: ArtistAlbumViewModel[];
  singles: ArtistReleaseViewModel[];
  initialFilter: ReleaseFilter;
  onClose: () => void;
}

const yearOf = (r: ArtistAlbumViewModel) => Number.parseInt(r.releaseDate ?? "", 10) || 0;

export default function ArtistReleasesView({
  open,
  artistName,
  albums,
  singles,
  initialFilter,
  onClose,
}: ArtistReleasesViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ReleaseFilter>(initialFilter);
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });

  useEffect(() => {
    if (open) setFilter(initialFilter);
  }, [open, initialFilter]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {}
  }, [view]);

  useEffect(() => {
    if (!open) return;
    return onAndroidBack(() => {
      if (menuOpen) setMenuOpen(false);
      else onClose();
      return true;
    });
  }, [open, menuOpen, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    if (filter !== "singles") list.push(...albums.map((release) => ({ release, kind: "album" as const })));
    if (filter !== "albums") list.push(...singles.map((release) => ({ release, kind: release.releaseType })));
    // newest first, stable for equal years
    return list
      .map((item, i) => ({ item, i }))
      .sort((a, b) => yearOf(b.item.release) - yearOf(a.item.release) || a.i - b.i)
      .map(({ item }) => item);
  }, [albums, singles, filter]);

  const kindLabel = (kind: Item["kind"]) =>
    kind === "album" ? t("artist.album") || "Album" : kind === "ep" ? "EP" : t("artist.single") || "Single";

  const filters: { id: ReleaseFilter; label: string; count: number }[] = [
    { id: "all", label: t("artist.all_releases") || "All", count: albums.length + singles.length },
    { id: "albums", label: t("artist.albums"), count: albums.length },
    { id: "singles", label: t("artist.singles"), count: singles.length },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="artist-releases"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 z-40 overflow-y-auto bg-bg-primary"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
          data-no-window-drag
        >
          {isMobile ? (
            <header
              className="sticky top-[0px] z-20 flex items-center gap-[6px] px-[8px] pb-[8px] border-b border-white/[0.05]"
              style={{
                paddingTop: "calc(var(--lane-safe-top, 0px) + 8px)",
                // Android's web view blurs only some of the covers behind a sticky
                // header (rectangles of blur): a nearly solid header instead
                background:
                  "linear-gradient(to bottom, color-mix(in srgb, var(--bg-primary, #0d0d10) 97%, transparent), color-mix(in srgb, var(--bg-primary, #0d0d10) 90%, transparent))",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.back") || "Back"}
                className="inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-text-primary active:bg-border-alpha-14 cursor-pointer"
              >
                <ArrowLeftLine size={22} />
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 truncate text-[18px] font-[600] tracking-[-0.01em] text-text-primary">
                  {t("artist.discography") || "Discography"}
                </h2>
                <p className="m-0 truncate text-[12px] text-text-tertiary">
                  {filters.find((f) => f.id === filter)?.label} · {items.length}
                </p>
              </div>
              <div className="relative shrink-0">
                <button
                  type="button"
                  ref={menuButtonRef}
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label={t("common.more") || "More"}
                  className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-full border-0 bg-transparent text-text-primary active:bg-border-alpha-14 cursor-pointer"
                >
                  <More2Fill size={22} />
                </button>
                <PhoneMenu open={menuOpen} anchorRef={menuButtonRef} onClose={() => setMenuOpen(false)}>
                  {filters.map((f) => (
                    <PhoneMenuItem
                      key={f.id}
                      label={f.label}
                      hint={f.count}
                      checked={filter === f.id}
                      onClick={() => {
                        setFilter(f.id);
                        setMenuOpen(false);
                      }}
                    />
                  ))}
                  <PhoneMenuDivider />
                  {(["grid", "list"] as const).map((mode) => (
                    <PhoneMenuItem
                      key={mode}
                      icon={mode === "grid" ? <GridLine size={16} /> : <MenuLine size={16} />}
                      label={mode === "grid" ? t("common.grid") || "Grid" : t("common.list") || "List"}
                      checked={view === mode}
                      onClick={() => {
                        setView(mode);
                        setMenuOpen(false);
                      }}
                    />
                  ))}
                </PhoneMenu>
              </div>
            </header>
          ) : (
          <header
            className="sticky top-[0px] z-20 flex flex-col gap-[12px] px-[32px] pb-[12px] backdrop-blur-2xl backdrop-saturate-150 border-b border-white/[0.05]"
            style={{
              paddingTop: "calc(var(--lane-safe-top, 0px) + var(--lane-releases-top, 52px))",
              background: "color-mix(in srgb, var(--bg-primary, #0d0d10) 62%, transparent)",
            }}
          >
            <div className="flex items-center gap-[12px]">
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13px] text-text-tertiary truncate">{artistName}</p>
                <h2 className="m-0 truncate text-[26px] font-[600] tracking-[-0.02em] text-text-primary">
                  {t("artist.discography") || "Discography"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close") || "Close"}
                className="inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border-0 bg-border-alpha-14 text-text-primary hover:bg-border-alpha-22 cursor-pointer transition-colors"
              >
                <CloseLine size={18} />
              </button>
            </div>
            <div className="flex items-center gap-[10px]">
              <div className="min-w-0 flex-1 overflow-x-auto no-scrollbar">
                <div className="w-max">
                  <SegmentedTabs
                    options={filters.map((f) => ({ id: f.id, label: f.label, count: f.count }))}
                    value={filter}
                    onChange={setFilter}
                  />
                </div>
              </div>
              <div className="shrink-0">
                <SegmentedTabs
                  iconOnly
                  options={[
                    { id: "grid" as const, label: <GridLine size={16} />, title: t("common.grid") || "Grid" },
                    { id: "list" as const, label: <MenuLine size={16} />, title: t("common.list") || "List" },
                  ]}
                  value={view}
                  onChange={setView}
                />
              </div>
            </div>
          </header>
          )}

          <div className={`relative ${isMobile ? "px-[8px] pt-[22px]" : "px-[24px] pt-[14px]"}`} style={{ paddingBottom: "calc(32px + var(--lane-dock-h, 0px))" }}>
            {view === "grid" ? (
              <div className="grid gap-x-[16px] gap-y-[8px] px-[8px]" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 168}px, 1fr))` }}>
                {items.map(({ release, kind }) =>
                  kind === "album" ? (
                    <AlbumCard
                      key={release.id}
                      id={release.id}
                      title={release.title}
                      coverUrl={release.coverUrl}
                      year={release.releaseDate}
                      explicit={release.explicit}
                      trackCount={release.totalTracks}
                    />
                  ) : (
                    <ReleaseCard
                      key={release.id}
                      id={release.id}
                      title={release.title}
                      coverUrl={release.coverUrl}
                      releaseType={kind}
                      year={release.releaseDate}
                      explicit={release.explicit}
                    />
                  ),
                )}
              </div>
            ) : (
              <div className="flex flex-col">
                {items.map(({ release, kind }) => (
                  <button
                    key={release.id}
                    type="button"
                    onClick={() => navigate(`/collection?type=album&id=${encodeURIComponent(release.id)}`)}
                    className="group flex w-full items-center gap-[14px] rounded-md border-0 bg-transparent p-[8px] text-left cursor-pointer hover:bg-border-alpha-14 transition-colors"
                  >
                    <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-md bg-border-alpha-14">
                      {release.coverUrl && (
                        <CoverImage src={release.coverUrl} alt={release.title} fill sizes="52px" className="object-cover" draggable={false} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[15px] text-text-primary">{release.title}</p>
                      <p className="m-0 mt-[2px] flex items-center gap-[6px] text-[13px] text-text-secondary">
                        {release.explicit && <ExplicitBadge size="md" className="shrink-0" />}
                        <span>{kindLabel(kind)}</span>
                        {release.releaseDate && <span className="text-text-tertiary">· {release.releaseDate}</span>}
                      </p>
                    </div>
                    {release.totalTracks ? (
                      <span className="shrink-0 text-[13px] text-text-tertiary tabular-nums">
                        {t("common.tracks", { count: release.totalTracks })}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
