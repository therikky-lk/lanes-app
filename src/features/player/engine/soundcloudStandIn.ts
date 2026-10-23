// When YouTube can't serve a track (region locked for the viewer, or every
// stream host is blocked on the network), look for the same song on SoundCloud.
import { fetchSoundCloudApi, soundCloudTrackId } from "@/shared/media/soundcloud";
import { artistsMatch } from "@/shared/media/matching/artists";
import { normalizeTrackString } from "@/shared/media/matching/phonetic";
import { cleanBaseTitle } from "@/shared/media/matching";
import { diag } from "@/shared/platform/diag";
import type { PlayableTrack } from "./playbackStream";

const remembered = new Map<string, string | null>();

interface Candidate {
  id: number;
  title: string;
  user: string;
  publisherArtist: string;
  durationMs: number;
  fullDurationMs: number;
  policy: string;
}

function tokens(value: string): Set<string> {
  return new Set(normalizeTrackString(value).split(" ").filter((t) => t.length > 1));
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / a.size;
}

function parse(raw: unknown): Candidate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const user = (r.user ?? {}) as Record<string, unknown>;
  const meta = (r.publisher_metadata ?? {}) as Record<string, unknown>;
  if (typeof r.id !== "number" || typeof r.title !== "string") return null;
  return {
    id: r.id,
    title: r.title,
    user: typeof user.username === "string" ? user.username : "",
    publisherArtist: typeof meta.artist === "string" ? meta.artist : "",
    durationMs: typeof r.duration === "number" ? r.duration : 0,
    fullDurationMs: typeof r.full_duration === "number" ? r.full_duration : 0,
    policy: typeof r.policy === "string" ? r.policy.toUpperCase() : "ALLOW",
  };
}

function score(track: PlayableTrack, c: Candidate): number {
  // previews (30 s snippets of Go+ tracks) and blocked uploads are useless
  if (c.policy === "SNIP" || c.policy === "BLOCK") return -1;
  if (c.fullDurationMs && c.durationMs && c.fullDurationMs - c.durationMs > 5000) return -1;
  const wantTitle = tokens(cleanBaseTitle(track.title));
  const titleScore = overlap(wantTitle, tokens(c.title));
  if (titleScore < 0.6) return -1;
  const artist = track.artists.split(/,|&| feat\.? | ft\.? /i)[0]?.trim() ?? "";
  const artistOk =
    !artist ||
    artistsMatch(artist, c.publisherArtist) ||
    artistsMatch(artist, c.user) ||
    normalizeTrackString(c.title).includes(normalizeTrackString(artist));
  if (!artistOk) return -1;
  let s = titleScore * 2 + 1;
  if (track.durationMs > 0 && c.durationMs > 0) {
    const delta = Math.abs(track.durationMs - c.durationMs);
    if (delta > 15_000) return -1;
    s += 1 - delta / 15_000;
  }
  return s;
}

/** SoundCloud track id ("sc:123") for the same song, or null */
export async function findSoundCloudStandIn(track: PlayableTrack, signal?: AbortSignal): Promise<string | null> {
  if (remembered.has(track.id)) return remembered.get(track.id) ?? null;
  const query = `${track.artists.split(",")[0] ?? ""} ${cleanBaseTitle(track.title)}`.trim();
  if (!query) return null;
  const response = await fetchSoundCloudApi("/search/tracks", { q: query, limit: "20" }, { signal });
  if (!response.ok) throw new Error(`SoundCloud search returned HTTP ${response.status}`);
  const body = (await response.json()) as { collection?: unknown[] };
  let best: { c: Candidate; s: number } | null = null;
  for (const raw of body.collection ?? []) {
    const c = parse(raw);
    if (!c) continue;
    const s = score(track, c);
    if (s > 0 && (!best || s > best.s)) best = { c, s };
  }
  const id = best ? soundCloudTrackId(best.c.id) : null;
  remembered.set(track.id, id);
  diag(id ? `SoundCloud stand-in for "${track.title}": ${best!.c.user} — ${best!.c.title}` : `no SoundCloud match for "${track.title}"`);
  return id;
}
