import type { SearchResult } from "@/shared/contracts";

const normalize = (name: string) =>
  name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

export function sameArtistName(left: string, right: string): boolean {
  return normalize(left) === normalize(right);
}

export function uniqueArtistId(items: SearchResult[], name: string): string | undefined {
  const ids = new Set(items.flatMap((item) =>
    item.type === "artist" && item.id && sameArtistName(item.name, name) ? [item.id] : [],
  ));
  return ids.size === 1 ? ids.values().next().value : undefined;
}

export function artistHref(id: string, name?: string): string {
  const params = new URLSearchParams({ id });
  if (name?.trim()) params.set("name", name);
  return `/artist?${params}`;
}
