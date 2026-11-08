import type { TrackArtist as ContractTrackArtist } from "../contracts";

export interface TrackArtist {
  id?: string;
  name: string;
}

export interface Track {
  id: string;
  playlistItemId?: string;
  title: string;
  artists: string;
  artistId?: string;
  artistList?: (ContractTrackArtist | TrackArtist)[];
  coverUrl: string;
  durationMs: number;
  playCount: number;
  explicit?: boolean;
  releaseDate?: string;
  /** When this track was liked/saved in the user's library. */
  likedAt?: string | number;
  album?: {
    id: string;
    title: string;
  };
  /** the user's own file, kept on another device: the name of that device */
  onlyOnDevice?: string;
  /** Marks a manual queue addition so the queue UI can group it separately. */
  queuedByUser?: boolean;
}
