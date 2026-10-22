import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftLine, PlayFill, UploadLine, MusicLine, Edit2Line, DeleteLine } from "@mingcute/react";
import { LuShuffle } from "react-icons/lu";
import Button from "@/shared/ui/Button";
import { useToast } from "@/shared/ui";
import ScrollBlurEdge from "@/shared/ui/ScrollBlurEdge";
import SongCard from "@/features/player/ui/SongCard";
import { playerEngine, usePlayerStore } from "@/features/player";
import CustomLyricsDialog from "@/features/lyrics/ui/CustomLyricsDialog";
import { useTranslation } from "@/languages";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";
import { addLocalFiles, removeLocalTrack } from "@/shared/media/local/localTracks";
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
  const { tracks, isLoading } = useLocalTracks();
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lyricsFor, setLyricsFor] = useState<Track | null>(null);
  const dragDepth = useRef(0);

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
    const list = shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks;
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
      <div className="h-full w-full overflow-y-auto pb-[32px]" style={font}>
        <ScrollBlurEdge height={72} />
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/library"))}
          data-no-window-drag
          className={`sticky top-[12px] ml-[32px] z-20 group inline-flex h-[32px] items-center gap-[6px] rounded-md px-[10px] active:scale-[0.94] transition-all cursor-pointer text-[13px] font-[500] border-0 ${
            hasCustomBg ? "apple-glass-pill" : "bg-bg-panel/85 backdrop-blur-xl text-text-primary hover:bg-bg-panel"
          }`}
        >
          <ArrowLeftLine size={16} className="transition-transform duration-150 group-hover:-translate-x-0.5" />
          <span>{t("common.back")}</span>
        </button>

        <header className="flex flex-wrap items-end gap-[20px] px-[32px] pt-[20px] pb-[18px]" data-no-window-drag>
          <div
            className={`flex h-[120px] w-[120px] shrink-0 items-center justify-center rounded-md ${
              hasCustomBg ? "apple-glass-static" : "bg-bg-panel"
            }`}
          >
            <MusicLine size={46} className={hasCustomBg ? "text-white" : "text-text-tertiary"} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[26px] font-bold tracking-tight text-text-primary">{t("local.title") || "My tracks"}</h1>
            <p className="m-0 mt-[4px] text-[13px] text-text-tertiary">
              {t("local.subtitle") || "Your own audio files. They stay on this device."} · {t("common.songs", { count: tracks.length })}
            </p>
            <div className="mt-[14px] flex flex-wrap items-center gap-[8px]">
              <Button
                variant={hasCustomBg ? "glass-primary" : "primary"}
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="!h-[36px] !text-[13.5px] !font-[500] px-[16px] flex items-center gap-[6px]"
              >
                <UploadLine size={16} />
                {uploading ? t("local.uploading") || "Adding…" : t("local.upload") || "Upload files"}
              </Button>
              <Button
                variant={hasCustomBg ? "glass-action" : "outline"}
                onClick={() => playAll(false)}
                disabled={tracks.length === 0}
                className="!h-[36px] !text-[13px] px-[14px] flex items-center gap-[6px]"
              >
                <PlayFill size={15} />
                {t("common.play_all")}
              </Button>
              <Button
                variant={hasCustomBg ? "glass-action" : "outline"}
                onClick={() => playAll(true)}
                disabled={tracks.length === 0}
                className="!h-[36px] !w-[36px] !p-0 flex items-center justify-center"
                title={t("common.shuffle")}
              >
                <LuShuffle size={16} />
              </Button>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="audio/*,.mp3,.m4a,.flac,.ogg,.opus,.wav"
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </header>

        <div className="px-[24px]" data-no-window-drag>
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
            tracks.map((track) => (
              <SongCard
                key={track.id}
                id={track.id}
                title={track.title}
                artists={track.artists || t("local.unknown_artist") || "Unknown artist"}
                artistsClickable={false}
                coverUrl={track.coverUrl}
                icon={track.coverUrl ? undefined : <MusicLine size={20} className="text-text-tertiary" />}
                albumTitle={track.album?.title ?? ""}
                duration={formatDuration(track.durationMs)}
                isCurrent={currentTrackId === track.id}
                onPlay={() => play(track)}
                menuItems={[
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
                    onClick: () => void removeLocalTrack(track.id),
                  },
                ]}
              />
            ))
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
