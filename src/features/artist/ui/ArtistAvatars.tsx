import { useState } from "react";
import type { TrackArtist } from "@/shared/types";
import { useArtistAvatar } from "../hooks/useArtistAvatar";
function Avatar({ artist, size }: { artist: TrackArtist; size: number }) {
  const url = useArtistAvatar(artist.id, artist.name);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || url === failedUrl) return null;
  return <span data-artist-avatar={artist.name} className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-[8px] font-medium text-current"
    style={{ width: size, height: size }}>
    <img src={url} alt="" className="h-full w-full object-cover" draggable={false} onError={() => setFailedUrl(url)} />
  </span>;
}
export function ArtistAvatars({ artistId, artistList, name, size = 18 }: { artistId?: string; artistList?: TrackArtist[]; name: string; size?: number }) {
  const artists = artistList?.length ? artistList : name.split(",").map((part, index) => ({ id: index === 0 ? artistId : undefined, name: part.trim() }));
  return <span aria-hidden="true" className="inline-flex shrink-0 items-center -space-x-[6px]">
    {artists.filter(artist => artist.name).slice(0, 3).map((artist, index) => <Avatar key={`${artist.id ?? artist.name}-${index}`} artist={artist} size={size} />)}
  </span>;
}
