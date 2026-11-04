import {
  Fragment,
  useRef,
  useState,
  useLayoutEffect,
  useEffect,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { splitJoinedArtists } from "@/shared/api/track";
import type { TrackArtist } from "@/shared/types";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { useArtistSheetStore, type ArtistSheetArtist } from "../store/artistSheetStore";

export interface ArtistLinkProps {
  name?: string;
  artistId?: string;
  artists?: string;
  artistList?: TrackArtist[];
  className?: string;
  separator?: string;
  onNavigate?: () => void;
}

export default function ArtistLink({
  name,
  artistId,
  artists,
  artistList,
  className = "",
  separator = ", ",
  onNavigate,
}: ArtistLinkProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [delta, setDelta] = useState(0);
  const [hovered, setHovered] = useState(false);

  const measure = useCallback(() => {
    if (!outerRef.current || !innerRef.current) return;
    const diff = innerRef.current.scrollWidth - outerRef.current.clientWidth;
    setDelta(Math.max(0, diff));
  }, []);

  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Normalize here too: saved tracks may still contain old joined credits.
  const normalized = splitJoinedArtists(artistList?.length ? artistList : [
    { id: artistId, name: name ?? artists ?? "" },
  ]);
  const sheetArtists: ArtistSheetArtist[] = normalized.map((artist, index) => ({
    id: artist.id && artist.id !== "unknown"
      ? artist.id
      : index === 0 && artistId && artistId !== "unknown" ? artistId : artist.name,
    name: artist.name,
  }));

  /** desktop: open the artist; phone: slide up the artist sheet first */
  const goArtist = (targetId: string) => {
    if (isMobile) {
      const list = sheetArtists.some((a) => a.id === targetId)
        ? sheetArtists
        : [{ id: targetId, name: targetId }, ...sheetArtists];
      useArtistSheetStore.getState().open(list, targetId, onNavigate);
      return;
    }
    onNavigate?.();
    navigate(`/artist?id=${encodeURIComponent(targetId)}`);
  };

  const innerContent = sheetArtists.map((artist, index) => (
    <Fragment key={`${artist.id}-${index}`}>
      {index > 0 && <span className="select-none whitespace-pre">{separator}</span>}
      <span
        role="button"
        tabIndex={0}
        className="cursor-pointer hover:text-text-primary transition-colors duration-150 prevent-seek"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); goArtist(artist.id); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            goArtist(artist.id);
          }
        }}
      >{artist.name}</span>
    </Fragment>
  ));

  const maskStyle = delta > 0
    ? {
        maskImage: hovered
          ? "linear-gradient(to right, transparent 0px, black 12px, black calc(100% - 14px), transparent 100%)"
          : "linear-gradient(to right, black 0px, black calc(100% - 14px), transparent 100%)",
        WebkitMaskImage: hovered
          ? "linear-gradient(to right, transparent 0px, black 12px, black calc(100% - 14px), transparent 100%)"
          : "linear-gradient(to right, black 0px, black calc(100% - 14px), transparent 100%)",
        transition: "mask-image 200ms ease, -webkit-mask-image 200ms ease",
      }
    : undefined;

  return (
    <span
      ref={outerRef}
      className={`relative inline-flex items-center min-w-0 max-w-full overflow-hidden text-left ${className}`}
      style={maskStyle}

      onMouseEnter={() => {
        measure();
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        ref={innerRef}
        className="inline-flex items-center whitespace-nowrap flex-nowrap shrink-0"
        style={{
          transform:
            hovered && delta > 0
              ? `translateX(-${delta + 6}px)`
              : "translateX(0)",
          transition: hovered
            ? `transform ${Math.max(800, delta * 14)}ms linear`
            : "transform 300ms ease",
        }}
      >
        {innerContent}
      </span>
    </span>
  );
}

