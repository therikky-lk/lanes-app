import type { SearchResult } from "@/shared/contracts";
import { toPhoneticLatin } from "@/shared/media/matching/phonetic";

const normalize = (name: string) =>
  name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

const localizedArtistNames = new Map([
  ["даня милохин", "danya milohin"],
  ["христина соловій", "khrystyna soloviy"],
  ["тату", "t.a.t.u."],
  ["билли айлиш", "billie eilish"],
  ["билли эйлиш", "billie eilish"],
  ["тоня матвієнко", "tonya matvienko"],
  ["тоня матвиенко", "tonya matvienko"],
  ["tonya matviienko", "tonya matvienko"],
  ["антонина петровна матвиенко", "tonya matvienko"],
]);

function normalizedArtistName(name: string): string {
  const normalized = normalize(name);
  return localizedArtistNames.get(normalized) ?? normalized;
}

export function sameArtistName(left: string, right: string): boolean {
  const a = normalizedArtistName(left);
  const b = normalizedArtistName(right);
  if (a === b) return true;
  // Transliteration is only a fallback across scripts, not between two
  // different names in the same script.
  if (/\p{Script=Cyrillic}/u.test(a) === /\p{Script=Cyrillic}/u.test(b)) return false;
  const phoneticA = toPhoneticLatin(a);
  const phoneticB = toPhoneticLatin(b);
  return phoneticA.length > 2 && phoneticA === phoneticB;
}

export function uniqueArtistId(items: SearchResult[], name: string): string | undefined {
  const artists = items.flatMap((item) =>
    item.type === "artist" && item.id
      ? [{ id: canonicalArtistId(item.id, item.name), name: item.name }]
      : [],
  );
  const target = normalizedArtistName(name);
  const exact = artists.filter((artist) => normalizedArtistName(artist.name) === target);
  const matches = exact.length ? exact : artists.filter((artist) => sameArtistName(artist.name, name));
  const ids = new Set(matches.map((artist) => artist.id));
  return ids.size === 1 ? ids.values().next().value : undefined;
}

const artistAliases = new Map([
  // .youngfox: the duplicate YouTube Music profile points to a different channel.
  ["UCFoLa3BHUvHdiR-zXJfN3RQ", "UCywwKs0TAZfYL4naYTkjJow"],
  ["UCFnY9HTzVloyLXz-3Ak--_Q", "UCfmezqOwYi6svvnsXJzPoig"],
]);

const verifiedArtistProfiles = new Map([
  ["danya milohin", "UCFlt4v80SainY2mhHL8sVJw"],
  ["khrystyna soloviy", "UCFpAfa7PvHFd1hejLtqAtqQ"],
  ["t.a.t.u.", "UChTBSId6VeDfiIEuRvqTO6A"],
  ["tonya matvienko", "UCfmezqOwYi6svvnsXJzPoig"],
]);

export function canonicalArtistId(id: string, name?: string | null): string {
  if (/^apple-artist:\d+$/.test(id)) return id;
  return artistAliases.get(id) ?? verifiedArtistProfiles.get(normalizedArtistName(name || id))
    ?? verifiedArtistProfiles.get(normalizedArtistName(id)) ?? id;
}

// Learned from the provider for the lifetime of the session. Never guess a
// Cyrillic spelling by transliterating a name back from Latin.
const observedArtistNames = new Map<string, { catalogName: string; displayName: string }>();

export function rememberArtistDisplayName(id: string, catalogName: string, displayName: string): void {
  observedArtistNames.delete(id);
  observedArtistNames.set(id, { catalogName, displayName });
  if (observedArtistNames.size > 512) observedArtistNames.delete(observedArtistNames.keys().next().value!);
}

export function nativeArtistName(id: string, name: string): string {
  const observed = observedArtistNames.get(id) ?? observedArtistNames.get(artistAliases.get(id) ?? "");
  return observed && (sameArtistName(name, observed.catalogName) || sameArtistName(name, observed.displayName))
    ? observed.displayName : name;
}

const nativeTrackTitles = new Map([
  ["UChTBSId6VeDfiIEuRvqTO6A", new Map([
    ["nas ne dagoniat", "Нас не догонят"],
    ["ya soshla s uma", "Я сошла с ума"],
  ])],
  ["UCFpAfa7PvHFd1hejLtqAtqQ", new Map([
    ["trymai", "Тримай"], ["fortepiano", "Фортепіано"], ["stezhechka", "Стежечка"],
  ])],
]);

export function nativeTrackTitle(title: string, artist: { id?: string; name: string }): string {
  return nativeTrackTitles.get(canonicalArtistId(artist.id ?? "", artist.name))?.get(normalize(title)) ?? title;
}

export function artistHref(id: string, name?: string, sourceTrackId?: string): string {
  const params = new URLSearchParams({ id: canonicalArtistId(id, name) });
  if (name?.trim()) params.set("name", name);
  if (sourceTrackId) params.set("track", sourceTrackId);
  return `/artist?${params}`;
}
