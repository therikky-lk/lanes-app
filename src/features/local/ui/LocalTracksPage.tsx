import TrackCollectionHeader from "@/features/library/ui/TrackCollectionHeader";
import { TrackSearchField, useTrackSearch } from "@/features/library/ui/TrackSearch";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import OfflineCover from "@/features/library/ui/OfflineCover";
import { shuffle as shuffleList } from "@/shared/utils/shuffle";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftLine, PlayFill, UploadLine, MusicLine, Edit2Line, DeleteLine, HeartLine, HeartFill, AddLine } from "@mingcute/react";
import { useModalStore } from "@/features/library/store/modalStore";
import { usePlaylistsList } from "@/features/library/hooks/usePlaylists";
import { LuShuffle } from "react-icons/lu";
import Button from "@/shared/ui/Button";
import { useToast } from "@/shared/ui";
import { SwipeToQueue } from "@/shared/ui/SwipeToDelete";
import ScrollBlurEdge from "@/shared/ui/ScrollBlurEdge";
import SongCard from "@/features/player/ui/SongCard";
import { playerEngine, usePlayerStore } from "@/features/player";
import CustomLyricsDialog from "@/features/lyrics/ui/CustomLyricsDialog";
import { useTranslation } from "@/languages";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";
import { addLocalFiles, removeLocalTrack } from "@/shared/media/local/localTracks";
import { setLocalLike } from "../localLikesSync";
import type { Track } from "@/shared/types";
import { useLocalTracks } from "../hooks/useLocalTracks";

const font = { fontFamily: "var(--font-inter), sans-serif" };
const CONTEXT = "local:uploads";

function formatDuration(ms: number): string | undefined {
  if (!ms) return undefined;
  return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
}

export default function LocalTracksPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const hasCustomBg = useIsContentTransparent();
  const { tracks, records, isLoading } = useLocalTracks();
  const isMobile = useIsMobile();
  const search = useTrackSearch(tracks, CONTEXT);
  const visibleTracks = search.matches?.map(match => match.track) ?? tracks;
  const likedIds = new Set(records.filter((r) => r.likedAt).map((r) => r.id));
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lyricsFor, setLyricsFor] = useState<Track | null>(null);
  const dragDepth = useRef(0);
  const { data: playlistsData } = usePlaylistsList();

  const upload = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      try {
        const { added, skipped } = await addLocalFiles(Array.from(files));
        if (added.length) toast(t("local.added", { count: added.length }) || `Added: ${added.length}`, "checkmark");
        if (skipped.length) toast(t("local.skipped", { count: skipped.length }) || `Skipped: ${skipped.length}`, "error");
      } finally {
        setUploading(false);
      }
    },
    [t, toast],
  );

  const play = (track: Track) => playerEngine.playTrack(track, tracks, CONTEXT, track.coverUrl);
  const playAll = (shuffle = false) => {
    if (tracks.length === 0) return;
    const list = shuffle ? shuffleList(tracks) : tracks;
    playerEngine.playTrack(list[0], list, CONTEXT, list[0].coverUrl);
  };

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-transparent"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <div data-window-drag className="absolute top-0 left-0 right-0 h-[56px] z-10" />
      <div data-page-scroller className="h-full w-full overflow-y-auto pb-[32px]" style={{ ...font, paddingTop: isMobile ? "var(--lane-safe-top, 0px)" : 12, paddingBottom: isMobile ? "calc(var(--lane-dock-h, 120px) + 24px)" : 32 }}>
        <ScrollBlurEdge height={72} />
        <TrackCollectionHeader title={t("local.title")} kind="local" count={tracks.length}
          onPlay={() => playAll(false)} onShuffle={() => playAll(true)}
          onQueue={() => tracks.forEach(track => playerEngine.addToQueue(track))}
          onSearch={search.toggle} searchOpen={search.isOpen}
          extra={<Button variant="secondary" size="icon" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label={t("local.upload")}><UploadLine size={18} /></Button>} />
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="audio/*,.mp3,.m4a,.m4b,.aac,.flac,.ogg,.oga,.opus,.wav,.webm,.aiff,.aif,.ape,.alac,.amr,.ac3,.dsf,.dff,.mka,.wma"
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />

        <div className="px-[14px]">
          <TrackSearchField search={search} totalCount={tracks.length} placeholder={t("common.search")} closeOnBlur={false}
            className="!h-[44px] !w-full !rounded-[12px] my-[8px] [&_input]:text-[16px]" />
        </div>
        <div className="mx-[14px] rounded-[14px] bg-black/[0.03] dark:bg-white/[0.04] px-[8px] py-[8px]" data-no-window-drag>
          {!isLoading && tracks.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mx-[8px] flex w-[calc(100%-16px)] min-h-[220px] flex-col items-center justify-center gap-[8px] rounded-xl border border-dashed border-border-primary bg-transparent text-center cursor-pointer hover:bg-border-alpha-8 transition-colors"
            >
              <UploadLine size={32} className="text-text-tertiary" />
              <span className="text-[15px] font-[500] text-text-primary">{t("local.empty_title") || "Drop MP3 files here"}</span>
              <span className="text-[13px] text-text-tertiary max-w-[360px]">
                {t("local.empty_desc") || "or click to choose. Title, artist and cover are read from the file tags."}
              </span>
            </button>
          ) : (
            visibleTracks.map((track) => {
              const card = (
              <SongCard
                key={track.id}
                className="lane-row"
                id={track.id}
                highlight={search.activeQuery}
                title={track.title}
                artists={track.artists || t("local.unknown_artist") || "Unknown artist"}
                artistsClickable={false}
                coverUrl={track.coverUrl}
                icon={track.coverUrl ? undefined : <MusicLine size={20} className="text-text-tertiary" />}
                albumTitle={track.album?.title ?? ""}
                duration={formatDuration(track.durationMs)}
                isCurrent={currentTrackId === track.id}
                onPlay={() => play(track)}
                liked={likedIds.has(track.id)}
                onToggleLike={() => void setLocalLike(track.id, !likedIds.has(track.id))}
                menuItems={[
                  likedIds.has(track.id)
                    ? {
                        id: "unlike",
                        icon: <HeartFill size={15} />,
                        label: t("common.unlike"),
                        onClick: () => void setLocalLike(track.id, false),
                      }
                    : {
                        id: "like",
                        icon: <HeartLine size={15} />,
                        label: t("common.like"),
                        onClick: () => void setLocalLike(track.id, true),
                      },
                  {
                    // the file stays here; other devices see it greyed out in the playlist
                    id: "add-to-playlist",
                    icon: <AddLine size={15} />,
                    label: t("common.add_to_playlist"),
                    onClick: () =>
                      useModalStore.getState().openAddToPlaylist({
                        id: track.id,
                        title: track.title,
                        artists: track.artists,
                        coverUrl: track.coverUrl,
                        duration: formatDuration(track.durationMs),
                        playlists: playlistsData?.playlists ?? [],
                      }),
                  },
                  {
                    id: "lyrics",
                    icon: <Edit2Line size={15} />,
                    label: t("player.custom_lyrics_edit") || "Edit lyrics",
                    onClick: () => setLyricsFor(track),
                  },
                  {
                    id: "delete",
                    icon: <DeleteLine size={15} />,
                    label: t("common.delete"),
                    danger: true,
                    onClick: () => {
                      if (likedIds.has(track.id)) void setLocalLike(track.id, false);
                      void removeLocalTrack(track.id);
                    },
                  },
                ]}
              />
              );
              const addToQueue = () => {
                playerEngine.addToQueue(track);
                toast(t("common.added_to_queue"), "checkmark", { description: track.title });
              };
              return isMobile
                ? <SwipeToQueue key={track.id} label={t("common.add_to_queue")} onAddToQueue={addToQueue}>{card}</SwipeToQueue>
                : <div key={track.id}>{card}</div>;
            })
          )}
        </div>
      </div>

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-[12px] z-40 flex flex-col items-center justify-center gap-[10px] rounded-2xl border-2 border-dashed border-text-secondary/50 bg-bg-primary/70 backdrop-blur-md"
            style={font}
          >
            <UploadLine size={40} className="text-text-primary" />
            <span className="text-[16px] font-[500] text-text-primary">{t("local.drop_here") || "Drop to add to My tracks"}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <CustomLyricsDialog
        open={lyricsFor !== null}
        onOpenChange={(open) => !open && setLyricsFor(null)}
        trackId={lyricsFor?.id ?? null}
        trackTitle={lyricsFor?.title}
      />
    </div>
  );
}
