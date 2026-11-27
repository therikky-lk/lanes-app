import { getTranslationsForAllLocales, type TFunction } from "@/languages/translator";
import { getImportedPlaylistMeta } from "./import/importedPlaylistMeta";
import { readPlaylistSource } from "./playlistCoverMarker";

const yandexKey = "settings.yandex_music.playlist_title";
const spotifyKey = "library.spotify_liked.menu";
const normalize = (title: string) => title.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const yandexDefaults = new Set(getTranslationsForAllLocales(yandexKey).map(normalize));
const spotifyDefaults = new Set(getTranslationsForAllLocales(spotifyKey).map(normalize));
const spotifyLikes = "(?:liked|likes) (?:songs|music|tracks)";
const spotifyTitle = new RegExp(`^(?:spotify\\s*[-–—|:]\\s*${spotifyLikes}|${spotifyLikes}(?:\\s*(?:[-–—|:]|from)\\s*spotify)?)$`, "i");

export function playlistDisplayTitle(playlist: { id?: string; title: string; description?: string | null }, t: TFunction): string {
  const title = normalize(playlist.title);
  const source = readPlaylistSource(playlist.description) ?? getImportedPlaylistMeta(playlist.id)?.source;
  if (source === "yandex" && yandexDefaults.has(title)) return t(yandexKey);
  if (source === "spotify" && (spotifyDefaults.has(title) || spotifyTitle.test(title))) return t(spotifyKey);
  return playlist.title;
}
