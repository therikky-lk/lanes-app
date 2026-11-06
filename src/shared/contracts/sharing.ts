export type ShareEntityType = "artist" | "album" | "playlist" | "track";
export interface ShareSnapshot { title: string; subtitle?: string; coverUrl?: string }
export interface SharedEntity {
  id: string;
  type: ShareEntityType;
  entityId: string;
  snapshot: ShareSnapshot;
  sender: { username: string; displayName: string };
}
