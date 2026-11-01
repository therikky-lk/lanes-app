import type { Track } from "@/shared/contracts";
import { videoThumbnailCover } from "./innertubeThumbnail";
import { getApiBaseUrl } from "@/shared/api/baseUrl";
import { isBrowserRuntime } from "@/shared/platform/browser";
import type { ResolvedAudioStream } from "./innertubeAudioFormats";

// Public instance from the Invidious project's maintained instance list.
// Requests are anonymous; no Lane or YouTube account credentials are sent.
export const INVIDIOUS_BASE_URL = "https://yt.chocolatemoo53.com";

interface InvidiousVideoResult {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  authorId?: string;
  lengthSeconds?: number;
  videoThumbnails?: Array<{ url?: string; width?: number; height?: number }>;
}

interface InvidiousAudioFormat {
  itag?: number | string;
  type?: string;
  bitrate?: number | string;
  audioQuality?: string;
  url?: string;
  clen?: number | string;
}

function absoluteUrl(value: string): string {
  return new URL(value, INVIDIOUS_BASE_URL).toString();
}

export async function searchInvidiousTracks(query: string, signal?: AbortSignal): Promise<Track[]> {
  const url = new URL("/api/v1/search", INVIDIOUS_BASE_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  const response = await fetch(url, {
    credentials: "omit",
    headers: { accept: "application/json" },
    signal: requestSignal(signal, 12_000),
  });
  if (!response.ok) throw new Error(`Invidious search returned HTTP ${response.status}.`);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error("Invidious search returned an invalid response.");

  return body.flatMap((value) => {
    const track = mapInvidiousTrack(value);
    return track && value.type === "video" ? [track] : [];
  });
}

function mapInvidiousTrack(value: InvidiousVideoResult | null): Track | null {
  if (!value || !/^[a-zA-Z0-9_-]{11}$/.test(value.videoId ?? "") || typeof value.title !== "string" || !value.title) return null;
  return {
    id: value.videoId!,
    title: value.title,
    artists: [{ id: value.authorId ?? "", name: (value.author || "YouTube").replace(/\s*-\s*Topic$/i, "").trim() }],
    durationMs: Math.max(0, Number(value.lengthSeconds) || 0) * 1000,
    cover: videoThumbnailCover(value.videoId!),
  };
}

interface InvidiousVideo extends InvidiousVideoResult {
  adaptiveFormats?: InvidiousAudioFormat[];
  recommendedVideos?: InvidiousVideoResult[];
}

async function getVideo(videoId: string, signal?: AbortSignal): Promise<InvidiousVideo> {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID.");
  const response = await fetch(absoluteUrl(`/api/v1/videos/${encodeURIComponent(videoId)}`), {
    credentials: "omit",
    headers: { accept: "application/json" },
    signal: requestSignal(signal, 15_000),
  });
  if (!response.ok) throw new Error(`Invidious video lookup returned HTTP ${response.status}.`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid Invidious video response.");
  return body as InvidiousVideo;
}

export async function getInvidiousTrack(videoId: string, signal?: AbortSignal): Promise<Track> {
  const track = mapInvidiousTrack({ ...await getVideo(videoId, signal), videoId });
  if (!track) throw new Error("Invidious returned no track details.");
  return track;
}

export async function getInvidiousRadio(videoId: string, limit: number, signal?: AbortSignal): Promise<Track[]> {
  const body = await getVideo(videoId, signal);
  const seen = new Set([videoId]);
  return (Array.isArray(body.recommendedVideos) ? body.recommendedVideos : []).flatMap((value) => {
    const track = mapInvidiousTrack(value);
    if (!track || seen.has(track.id)) return [];
    seen.add(track.id);
    return [track];
  }).slice(0, Math.max(0, limit));
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

const AUDIO_ITAGS = [251, 140, 250, 249, 139];

export async function resolveInvidiousAudioStream(
  videoId: string,
  signal?: AbortSignal,
  options: { preferredCodec?: "opus" | "aac"; preferHighest?: boolean } = {},
): Promise<ResolvedAudioStream> {
  const body = await getVideo(videoId, signal);
  const formats = (Array.isArray(body.adaptiveFormats) ? body.adaptiveFormats : []).filter((format) => {
    const type = typeof format?.type === "string" ? format.type.toLowerCase() : "";
    return type.startsWith("audio/") && AUDIO_ITAGS.includes(Number(format.itag));
  });
  const preferred = formats.filter((format) =>
    options.preferredCodec === "aac" ? /mp4|aac/i.test(format.type!) : /opus|webm/i.test(format.type!),
  );
  const candidates = preferred.length ? preferred : formats;
  const selected = options.preferHighest
    ? [...formats].sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0))[0]
    : AUDIO_ITAGS.map((itag) => candidates.find((format) => Number(format.itag) === itag)).find(Boolean)
      ?? [...candidates].sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0))[0];
  if (!selected?.type || !selected.itag) throw new Error("Invidious returned no playable audio format.");

  const streamUrl = new URL("/latest_version", INVIDIOUS_BASE_URL);
  streamUrl.searchParams.set("id", videoId);
  streamUrl.searchParams.set("itag", String(selected.itag));
  streamUrl.searchParams.set("local", "true");
  let playbackUrl = streamUrl.toString();
  if (isBrowserRuntime()) {
    const response = await fetch(`${getApiBaseUrl()}/v1/public/youtube/stream/${videoId}?itag=${selected.itag}`, {
      credentials: "omit",
      signal: requestSignal(signal, 15_000),
    });
    if (!response.ok) throw new Error(`Audio redirect lookup returned HTTP ${response.status}.`);
    const resolved = await response.json() as { url?: string };
    const target = new URL(resolved.url ?? "");
    if (target.protocol !== "https:" || !target.hostname.endsWith(".chocolatemoo53.com") || target.username || target.password) {
      throw new Error("Audio proxy returned an invalid URL.");
    }
    playbackUrl = target.toString();
  }
  const mimeType = selected.type.split(";")[0]?.trim() || "audio/webm";
  const opus = /opus|webm/i.test(selected.type);
  const contentLength = Number(selected.clen);
  return {
    url: playbackUrl,
    mimeType,
    codec: opus ? "opus" : "aac",
    bitrate: Number(selected.bitrate) || 128_000,
    itag: Number(selected.itag),
    expiresAt: null,
    ...(Number.isFinite(contentLength) && contentLength > 0 ? { contentLength } : {}),
  };
}
