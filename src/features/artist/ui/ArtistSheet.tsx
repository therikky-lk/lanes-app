import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { RightLine, User3Fill } from "@mingcute/react";
import { api, toMaxQualityAvatarUrl } from "@/shared/api";
import { useTranslation } from "@/languages";
import { onAndroidBack } from "@/shared/platform/androidBack";
import { useArtistSheetStore, type ArtistSheetArtist } from "../store/artistSheetStore";
import { useYourArtistTrackCount } from "../hooks/useYourArtistTrackCount";

const font = { fontFamily: "var(--font-inter), sans-serif" };

// ids from the catalog look like "UC…" / "sc:…"; a bare name has spaces or
// letters an id never carries, so there's no picture to fetch for it
const looksLikeId = (id: string) => /^(UC[\w-]{10,}|sc[:_]\S+|audius[:_]\S+|[\w-]{16,})$/.test(id);

const avatarCache = new Map<string, string | null>();

function useArtistAvatar(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? (avatarCache.get(id) ?? null) : null));
  useEffect(() => {
    if (!id || !looksLikeId(id)) {
      setUrl(null);
      return;
    }
    if (avatarCache.has(id)) {
      setUrl(avatarCache.get(id) ?? null);
      return;
    }
    let active = true;
    void api
      .getArtistImage(id)
      .then((raw) => {
        const value = raw ? toMaxQualityAvatarUrl(raw) : null;
        avatarCache.set(id, value);
        if (active) setUrl(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [id]);
  return url;
}

function Avatar({ artist, size }: { artist: ArtistSheetArtist; size: number }) {
  const url = useArtistAvatar(artist.id);
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-bg-panel flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={artist.name}
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : artist.name ? (
        <span className="text-text-secondary font-[600]" style={{ fontSize: size * 0.4 }}>
          {artist.name.trim().charAt(0).toUpperCase()}
        </span>
      ) : (
        <User3Fill size={size * 0.45} className="text-text-tertiary" />
      )}
    </div>
  );
}

function YourCount({ artist }: { artist: ArtistSheetArtist }) {
  const { t } = useTranslation();
  const { count, isLoading } = useYourArtistTrackCount({ id: artist.id, name: artist.name });
  if (isLoading) return <span className="inline-block h-[12px] w-[90px] animate-pulse rounded bg-border-alpha-14" />;
  return <>{t("artist.your_tracks", { count })}</>;
}

export default function ArtistSheet() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const artists = useArtistSheetStore((s) => s.artists);
  const selectedId = useArtistSheetStore((s) => s.selectedId);
  const close = useArtistSheetStore((s) => s.close);
  const isOpen = selectedId !== null;

  useEffect(() => {
    if (!isOpen) return;
    return onAndroidBack(() => {
      close();
      return true;
    });
  }, [isOpen, close]);

  const go = (artist: ArtistSheetArtist) => {
    const { onNavigate } = useArtistSheetStore.getState();
    close();
    onNavigate?.();
    navigate(`/artist?id=${encodeURIComponent(artist.id)}`);
  };

  const main = artists.find((a) => a.id === selectedId) ?? artists[0];
  const others = artists.filter((a) => a !== main);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {isOpen && main && (
        <motion.div
          key="artist-sheet"
          className="fixed inset-0 z-[400] flex flex-col justify-end"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
          style={font}
        >
          <motion.button
            type="button"
            aria-label={t("common.close") || "Close"}
            className="absolute inset-0 border-0 bg-black/45 p-0 cursor-default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
          />
          <motion.div
            role="dialog"
            className="relative w-full rounded-t-[22px] bg-bg-primary px-[18px] pt-[10px] shadow-[0_-10px_40px_rgba(0,0,0,0.35)]"
            style={{ paddingBottom: "calc(18px + var(--lane-safe-bottom, 0px))" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) close();
            }}
          >
            <div className="mx-auto mb-[14px] h-[5px] w-[38px] rounded-full bg-border-alpha-33" />

            <button
              type="button"
              onClick={() => go(main)}
              className="flex w-full flex-col items-center gap-[10px] border-0 bg-transparent p-0 text-center cursor-pointer"
            >
              <Avatar artist={main} size={112} />
              <span className="max-w-full truncate text-[22px] font-[700] tracking-[-0.01em] text-text-primary">
                {main.name}
              </span>
              <span className="text-[13px] text-text-tertiary">
                <YourCount artist={main} />
              </span>
            </button>

            <button
              type="button"
              onClick={() => go(main)}
              className="mt-[16px] flex h-[46px] w-full items-center justify-center gap-[6px] rounded-full border-0 bg-btn-primary-bg text-[15px] font-[600] text-btn-primary-text cursor-pointer active:scale-[0.98] transition-transform"
            >
              {t("artist.open")}
              <RightLine size={18} />
            </button>

            {others.length > 0 && (
              <div className="mt-[14px] flex flex-col gap-[2px] border-t border-border-alpha-14 pt-[10px]">
                {others.map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => go(artist)}
                    className="flex w-full items-center gap-[12px] rounded-[12px] border-0 bg-transparent px-[6px] py-[8px] text-left cursor-pointer active:bg-border-alpha-14"
                  >
                    <Avatar artist={artist} size={44} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-[500] text-text-primary">{artist.name}</span>
                      <span className="truncate text-[12.5px] text-text-tertiary">
                        <YourCount artist={artist} />
                      </span>
                    </span>
                    <RightLine size={18} className="shrink-0 text-text-tertiary" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
