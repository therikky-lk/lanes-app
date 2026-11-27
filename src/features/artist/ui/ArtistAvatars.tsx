import { useLayoutEffect, useState } from "react";
import type { TrackArtist } from "@/shared/types";
import { artistAvatarKey, trackAvatarArtists } from "../hooks/artistAvatarCache";
import { useArtistAvatar } from "../hooks/useArtistAvatar";

function Avatar({ artist, size }: { artist: TrackArtist; size: number }) {
  const url = useArtistAvatar(artist.id, artist.name);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!url) { setReadyUrl(null); return; }
    const image = new Image();
    image.onload = () => setReadyUrl(url);
    image.src = url;
    if (image.complete && image.naturalWidth > 0) setReadyUrl(url);
    return () => { image.onload = null; };
  }, [url]);

  // No initials while resolving a photo. Keep the previous image for this
  // artist while a cached copy (or a new URL) is loading.
  if (!readyUrl) return null;
  return <span data-artist-avatar={artist.name} className="inline-flex shrink-0 overflow-hidden rounded-full"
    style={{ width: size, height: size }}>
    <img src={readyUrl} alt="" className="h-full w-full object-cover" draggable={false} onError={() => setReadyUrl(null)} />
  </span>;
}

export function ArtistAvatars({ artistId, artistList, name, size = 18 }: { artistId?: string; artistList?: TrackArtist[]; name: string; size?: number }) {
  const artists = trackAvatarArtists({ artistId, artistList, artists: name });
  return <span aria-hidden="true" className="inline-flex shrink-0 items-center -space-x-[6px] empty:hidden">
    {artists.map(artist => <Avatar key={`${artistAvatarKey(artist.id, artist.name)}:${artist.name}`} artist={artist} size={size} />)}
  </span>;
}
