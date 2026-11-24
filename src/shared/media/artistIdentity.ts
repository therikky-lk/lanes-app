import type { SearchResult } from "@/shared/contracts";

const normalize = (name: string) =>
  name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

const localizedArtistNames = new Map([["даня милохин", "danya milohin"]]);

function normalizedArtistName(name: string): string {
  const normalized = normalize(name);
  return localizedArtistNames.get(normalized) ?? normalized;
}

export function sameArtistName(left: string, right: string): boolean {
  return normalizedArtistName(left) === normalizedArtistName(right);
}

export function uniqueArtistId(items: SearchResult[], name: string): string | undefined {
  const ids = new Set(items.flatMap((item) =>
    item.type === "artist" && item.id && sameArtistName(item.name, name) ? [canonicalArtistId(item.id, item.name)] : [],
  ));
  return ids.size === 1 ? ids.values().next().value : undefined;
}

const artistAliases = new Map([
  // .youngfox: the duplicate YouTube Music profile points to a different channel.
  ["UCFoLa3BHUvHdiR-zXJfN3RQ", "UCywwKs0TAZfYL4naYTkjJow"],
]);

const verifiedArtistProfiles = new Map([["danya milohin", "UCFlt4v80SainY2mhHL8sVJw"]]);

export function canonicalArtistId(id: string, name?: string | null): string {
  return artistAliases.get(id) ?? verifiedArtistProfiles.get(normalizedArtistName(name || id)) ?? id;
}

export function artistHref(id: string, name?: string): string {
  const params = new URLSearchParams({ id: canonicalArtistId(id, name) });
  if (name?.trim()) params.set("name", name);
  return `/artist?${params}`;
}
