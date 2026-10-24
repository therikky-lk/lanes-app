// Audius: an open music platform whose artists publish full tracks for free
// streaming through a public API (no key; requests name the app). Lane uses it
// as a third catalog next to YouTube Music and SoundCloud: its tracks show up
// in search and play in full.
import type { Track as ContractTrack, RadioResponse, TrackDetails } from "@/shared/contracts";

export const AUDIUS_API = "https://api.audius.co/v1";
const APP_NAME = "Lane";
const PREFIX = "au:";

export function audiusTrackId(id: string): string {
  return `${PREFIX}${id}`;
}

export function isAudiusId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(PREFIX);
}

export function parseAudiusId(id: string): string | null {
  return isAudiusId(id) ? id.slice(PREFIX.length) : null;
}

export function audiusStreamUrl(id: string): string {
  const raw = parseAudiusId(id) ?? id;
  return `${AUDIUS_API}/tracks/${encodeURIComponent(raw)}/stream?app_name=${APP_NAME}`;
}

interface AudiusTrack {
  id: string;
  title: string;
  duration?: number;
  genre?: string;
  mood?: string;
  is_streamable?: boolean;
  is_delete?: boolean;
  access?: { stream?: boolean };
  stream_conditions?: unknown;
  artwork?: Record<string, string | undefined> | null;
  user?: { id?: string; name?: string; handle?: string };
}

async function get<T>(path: string, params: Record<string, string | number> = {}, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), app_name: APP_NAME });
  const res = await fetch(`${AUDIUS_API}${path}?${query}`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`audius ${path}: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: T };
  if (body.data === undefined) throw new Error(`audius ${path}: no data`);
  return body.data;
}

/** full, free-to-stream tracks only (no gated / purchase-only / deleted ones) */
function playable(t: AudiusTrack): boolean {
  if (!t?.id || !t.title || t.is_delete) return false;
  if (t.is_streamable === false) return false;
  if (t.access && t.access.stream === false) return false;
  if (t.stream_conditions) return false;
  return true;
}

function cover(t: AudiusTrack): string | undefined {
  const a = t.artwork ?? {};
  return a["480x480"] || a["1000x1000"] || a["150x150"] || undefined;
}

export function mapAudiusTrack(t: AudiusTrack): ContractTrack {
  const url = cover(t);
  return {
    id: audiusTrackId(t.id),
    title: t.title,
    artists: [{ id: t.user?.id ? `au_user_${t.user.id}` : "", name: t.user?.name || t.user?.handle || "Audius" }],
    durationMs: Math.round((t.duration ?? 0) * 1000),
    ...(url ? { cover: { url, width: 480, height: 480 } } : {}),
  };
}

async function search(query: string, limit = 10, signal?: AbortSignal): Promise<ContractTrack[]> {
  const items = await get<AudiusTrack[]>("/tracks/search", { query, limit }, signal);
  return items.filter(playable).map(mapAudiusTrack);
}

async function getTrack(id: string, signal?: AbortSignal): Promise<TrackDetails> {
  const raw = parseAudiusId(id) ?? id;
  const t = await get<AudiusTrack>(`/tracks/${encodeURIComponent(raw)}`, {}, signal);
  return { ...mapAudiusTrack(t), id };
}

/** "radio" for an Audius track: more by the same artist plus trending in its genre */
async function getRadio(id: string, k = 20): Promise<RadioResponse> {
  const raw = parseAudiusId(id) ?? id;
  const seed = await get<AudiusTrack>(`/tracks/${encodeURIComponent(raw)}`);
  const [byArtist, trending] = await Promise.all([
    seed.user?.id ? get<AudiusTrack[]>(`/users/${encodeURIComponent(seed.user.id)}/tracks`, { limit: 20 }).catch(() => []) : Promise.resolve([]),
    get<AudiusTrack[]>("/tracks/trending", seed.genre ? { genre: seed.genre } : {}).catch(() => []),
  ]);
  const seen = new Set<string>([seed.id]);
  const out: AudiusTrack[] = [];
  const a = byArtist.filter(playable);
  const b = trending.filter(playable);
  for (let i = 0; out.length < k && (i < a.length || i < b.length); i++) {
    for (const t of [a[i], b[i], b[i + a.length]]) {
      if (t && !seen.has(t.id) && out.length < k) {
        seen.add(t.id);
        out.push(t);
      }
    }
  }
  return { items: out.map(mapAudiusTrack) };
}

export const audiusCatalog = { search, getTrack, getRadio };
