import type { Track } from "@/shared/types";

export type ShareEntityType = "artist" | "album" | "playlist" | "track" | "profile";
export interface ShareSnapshot { title: string; subtitle?: string; coverUrl?: string; artistAvatarUrl?: string }
export interface SharedEntity {
  id: string;
  type: ShareEntityType;
  entityId: string;
  snapshot: ShareSnapshot;
  sender: { username: string; displayName: string };
  profile?: {
    id: string;
    authBackend?: "liner" | "hyprr";
    username: string;
    displayName: string;
    bio: string;
    avatarUrl: string;
    banner: string | null;
    artist: { id: string; name: string; coverUrl: string } | null;
    tracks: Track[];
    followersCount?: number;
    listenedDurationMs?: number | null;
    likedTracksCount?: number | null;
  };
}
