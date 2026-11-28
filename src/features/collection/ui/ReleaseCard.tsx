import { useCallback, useRef, useState } from "react";
import { PlayFill } from "@mingcute/react";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useSongMenuItems } from "@/features/player/hooks/useSongMenuItems";
import DropdownMenu from "@/shared/ui/DropdownMenu";
import { loadVerifiedRelease } from "../hooks/loadVerifiedRelease";
import { playerEngine } from "@/features/player/engine/playerEngine";
import { toClientTrack } from "@/shared/api";
import { showToast } from "@/shared/ui/Toast";
import { useTranslation } from "@/languages";
import { isAppleReleaseId } from "@/shared/media/innertube/appleReleaseCatalog";

let latestPlaybackRequest = 0;

export interface ReleaseCardProps {
  id: string;
  title: string;
  coverUrl: string;
  releaseType: "single" | "ep";
  year?: string;
  explicit?: boolean;
  artistName?: string;
  className?: string;
}

export default function ReleaseCard({
  id,
  title,
  coverUrl,
  releaseType,
  year,
  explicit = false,
  artistName,
  className = "",
}: ReleaseCardProps) {
  const label = releaseType === "ep" ? "EP" : "Single";
  const { t } = useTranslation();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const originalUrl = isAppleReleaseId(id) ? `https://music.apple.com/us/album/${id.split(":")[1]}` : undefined;
  const notifyUnavailable = () => showToast(t("player.track_unavailable_title"), "error", {
    description: title,
    ...(originalUrl ? { action: {
      label: t("playlist.open_source"),
      onClick: () => window.open(originalUrl, "_blank", "noopener,noreferrer"),
    } } : {}),
  });

  const playRelease = async () => {
    if (pending.current) return;
    pending.current = true;
    const request = ++latestPlaybackRequest;
    setBusy(true);
    try {
      const release = await loadVerifiedRelease(id, title, artistName);
      if (request !== latestPlaybackRequest) return;
      const queue = release?.tracks.filter(track => !track.catalogUnavailable).map(toClientTrack) ?? [];
      if (!queue.length) {
        notifyUnavailable();
        return;
      }
      await playerEngine.playTrack(queue[0], queue, `album:${id}`, coverUrl);
    } catch {
      if (request === latestPlaybackRequest) notifyUnavailable();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const menuItems = useSongMenuItems({
    id,
    title,
    artists: artistName ?? "",
    coverUrl,
    searchType: "album",
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (menuItems.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      setMenuPosition({ x: e.clientX, y: e.clientY });
      setMenuOpen(true);
    },
    [menuItems],
  );

  const handleMenuOpenChange = useCallback((isOpen: boolean) => {
    setMenuOpen(isOpen);
    if (!isOpen) setMenuPosition(null);
  }, []);

  return (
    <div onContextMenu={handleContextMenu} className="relative">
      <button
        type="button"
        onClick={() => void playRelease()}
        disabled={busy}
        aria-busy={busy}
        aria-label={`${t("common.play")}: ${title}`}
        className={`group/release-card flex w-full min-w-0 flex-col gap-[8px] border-0 bg-transparent p-0 text-left cursor-pointer disabled:cursor-wait ${className}`}
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-border-alpha-14">
          {coverUrl ? (
            <CoverImage
              src={coverUrl}
              alt={title}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 16vw"
              className="object-cover transition-all duration-300 group-hover/release-card:brightness-[0.85]"
            />
          ) : null}
          <span className="absolute bottom-[8px] right-[8px] grid size-[36px] place-items-center rounded-full bg-white text-black opacity-0 transition-opacity group-hover/release-card:opacity-100 group-focus-visible/release-card:opacity-100" aria-hidden>
            <PlayFill size={18} />
          </span>
        </div>
        <div className="flex w-full min-w-0 flex-col">
          <span className="truncate text-[14px] font-[500] text-text-primary">
            {title}
          </span>
          <span className="flex items-center gap-[5px] truncate text-[13px] text-text-tertiary">
            {explicit && <ExplicitBadge />}
            <span>{label}</span>
            {year && (
              <>
                <span className="w-[3px] h-[3px] rounded-full bg-text-tertiary/40 shrink-0" aria-hidden />
                <span>{year}</span>
              </>
            )}
          </span>
        </div>
      </button>
      {menuItems.length > 0 && (
        <DropdownMenu
          trigger={<span />}
          items={menuItems}
          open={menuOpen}
          onOpenChange={handleMenuOpenChange}
          position={menuPosition}
        />
      )}
    </div>
  );
}
