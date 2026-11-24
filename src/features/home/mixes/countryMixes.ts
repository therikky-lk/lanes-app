import { api, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types";
import type { TFunction } from "@/languages/translator";
import { fetchFeed, resolveSong, type ChartSong } from "../trends/charts";
import { OTHER_VIBE_LANGUAGES, QUICK_VIBE_FLAGS, VIBE_REGION_LANGUAGES } from "../vibe/vibeLanguages";

export const COUNTRY_MIX_SIZE = 25;
const ID_PREFIX = "country-mix-";
const countryQueries = new Map<string, string[]>([
  [QUICK_VIBE_FLAGS.russian, ["популярные русские песни"]],
  [QUICK_VIBE_FLAGS.english, ["US music charts"]],
]);
for (const [, country, , query] of Object.values(OTHER_VIBE_LANGUAGES)) countryQueries.set(country, [query]);
for (const [region, languages] of Object.entries(VIBE_REGION_LANGUAGES)) {
  const country = OTHER_VIBE_LANGUAGES[region as keyof typeof VIBE_REGION_LANGUAGES][1];
  countryQueries.get(country)?.push(...Object.values(languages).map(([, query]) => query));
}

export const COUNTRY_MIX_COUNTRIES = [...countryQueries.keys()];
export const countryMixId = (country: string) => `${ID_PREFIX}${country}`;
export const countryMixBadge = (t: TFunction) => t("home.country_mix_badge", { n: COUNTRY_MIX_SIZE });
export const countryMixTitle = (t: TFunction, name: string) => `${countryMixBadge(t)} · ${name}`;
export const countryMixCover = (country: string) => `${import.meta.env.BASE_URL}country-mix-tiles/${country}.svg`;

export function countryFromMixId(id: string): string | null {
  if (!id.startsWith(ID_PREFIX)) return null;
  const country = id.slice(ID_PREFIX.length);
  return countryQueries.has(country) ? country : null;
}

function addTracks(result: Map<string, Track>, tracks: (Track | null)[]) {
  for (const track of tracks) {
    if (result.size >= COUNTRY_MIX_SIZE) break;
    if (track?.id && track.durationMs > 0 && track.durationMs <= 15 * 60_000 && !result.has(track.id)) {
      result.set(track.id, track);
    }
  }
}

/** Load only the mix the listener opens, pulling lower-ranked songs to replace unavailable matches. */
export async function loadCountryMix(country: string): Promise<Track[]> {
  const queries = countryQueries.get(country);
  if (!queries) return [];
  const result = new Map<string, Track>();
  const feed = await fetchFeed(country.toLowerCase(), 50, AbortSignal.timeout(4500)).catch(() => [] as ChartSong[]);
  const matchBudget = AbortSignal.timeout(9000);
  for (let i = 0; i < feed.length && result.size < COUNTRY_MIX_SIZE && !matchBudget.aborted; i += 8) {
    const tracks = await Promise.all(feed.slice(i, i + 8).map(song =>
      resolveSong(song, matchBudget).catch(() => null)));
    addTracks(result, tracks);
  }
  if (result.size >= COUNTRY_MIX_SIZE) return [...result.values()];

  // Apple doesn't publish a feed for every region. Use local-language searches
  // and country-specific playlists as a fallback, never an unrelated global list.
  const name = new Intl.DisplayNames("en", { type: "region" }).of(country) ?? country;
  const searchTerms = [`popular songs ${name}`, ...queries];
  const results = await Promise.all(searchTerms.map(async term => {
    const [songs, playlists] = await Promise.all([
      api.search(term, "track").catch(() => null),
      api.search(term, "playlist").catch(() => null),
    ]);
    return {
      songs: songs?.items.flatMap(item => item.type === "track" ? [toClientTrack(item)] : []) ?? [],
      playlists: playlists?.items.flatMap(item => item.type === "playlist" ? [item.id] : []).slice(0, 2) ?? [],
    };
  }));
  // Take the top result of each query first so multilingual regions are represented.
  for (let rank = 0; result.size < COUNTRY_MIX_SIZE && results.some(entry => rank < entry.songs.length); rank++) {
    addTracks(result, results.map(entry => entry.songs[rank] ?? null));
  }
  const playlistIds = [...new Set(results.flatMap(entry => entry.playlists))];
  for (let i = 0; i < playlistIds.length && result.size < COUNTRY_MIX_SIZE; i += 3) {
    const playlists = await Promise.all(playlistIds.slice(i, i + 3).map(id => api.getPlaylist(id).catch(() => null)));
    for (const playlist of playlists) addTracks(result, playlist?.tracks.map(toClientTrack) ?? []);
  }
  return [...result.values()];
}
