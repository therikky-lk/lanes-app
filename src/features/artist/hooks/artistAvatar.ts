import { api, mediaUrl, toMaxQualityAvatarUrl } from "@/shared/api";
const normalize = (name: string) => name.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export async function resolveArtistAvatar(id?: string, name?: string): Promise<string | null> {
  const byId = async () => {
    if (!id || id === "unknown" || id === name) throw new Error("No catalog artist id");
    const image = await api.getArtistImage(id);
    if (!image) throw new Error("Artist id has no photo");
    return toMaxQualityAvatarUrl(mediaUrl(image));
  };
  const byName = async () => {
    if (!name?.trim()) throw new Error("No artist name");
    const result = await api.search(name, "artist");
    const artist = result.items.find(item => item.type === "artist" && normalize(item.name) === normalize(name) && item.cover?.url);
    if (!artist || artist.type !== "artist" || !artist.cover?.url) throw new Error("No matching artist photo");
    return toMaxQualityAvatarUrl(mediaUrl(artist.cover.url));
  };
  // A stale/imported id must not delay the name lookup for the current artist.
  return Promise.any([byId(), byName()]).catch(() => null);
}
