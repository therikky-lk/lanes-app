import { useId, useMemo } from "react";
import { playerEngine } from "@/features/player/engine/playerEngine";
import TrackGridCard from "@/features/player/ui/TrackGridCard";
import { useTranslation } from "@/languages";
import type { Track } from "@/shared/types";
import ScrollableRow from "@/shared/ui/ScrollableRow";
import { useYourArtistTracks } from "../hooks/useYourArtistTrackCount";
import { sameArtistName } from "@/shared/media/artistIdentity";

function withProfileCredit(track: Track, id: string, name: string): Track {
  const matches = (credit: { id?: string; name: string }) =>
    credit.id && credit.id !== "unknown" ? credit.id === id : sameArtistName(credit.name, name);
  if (track.artistList?.length) {
    if (!track.artistList.some(credit => matches(credit) && credit.name !== name)) return track;
    const artistList = track.artistList.map(credit => matches(credit) ? { ...credit, name } : credit);
    return { ...track, artistList, artists: artistList.map(credit => credit.name).join(", ") };
  }
  return track.artists !== name && sameArtistName(track.artists, name) && matches({ id: track.artistId, name: track.artists })
    ? { ...track, artists: name }
    : track;
}

export function ArtistSavedTracksShelf({ tracks, name, coverUrl }: {
  tracks: Track[];
  name: string;
  coverUrl?: string;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  if (!tracks.length) return null;

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-center justify-between mb-[16px] gap-[12px]">
        <h2 id={headingId} className="m-0 text-[22px] font-[500] text-text-primary"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}>
          {t("artist.saved_tracks")}
          <span className="ml-[8px] text-[14px] font-[400] text-text-tertiary tabular-nums">{tracks.length}</span>
        </h2>
      </div>
      <ScrollableRow overlayWidth="w-[32px]" className="flex w-full gap-[16px] overflow-x-auto pb-[24px]">
        {tracks.map((track, index) => (
          <div key={track.id} className="w-[180px] shrink-0">
            <TrackGridCard
              track={track}
              variant="shelf"
              coverFallback={coverUrl}
              onPlay={() => playerEngine.playTrack(track, tracks, name, coverUrl, index)}
            />
          </div>
        ))}
      </ScrollableRow>
    </section>
  );
}

export default function ArtistSavedTracks({ id, name, coverUrl }: {
  id: string | null;
  name: string;
  coverUrl?: string;
}) {
  const { tracks } = useYourArtistTracks({ id, name });
  const withProfileName = useMemo(() => id && name ? tracks.map(track => withProfileCredit(track, id, name)) : tracks, [id, name, tracks]);
  return <ArtistSavedTracksShelf tracks={withProfileName} name={name} coverUrl={coverUrl} />;
}
