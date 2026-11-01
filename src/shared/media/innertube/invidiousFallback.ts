import type { Track } from "@/shared/contracts";
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
    headers: { accept: "application/json" },
    signal: signal ?? AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Invidious search returned HTTP ${response.status}.`);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error("Invidious search returned an invalid response.");

  return body.flatMap((value: InvidiousVideoResult) => {
    if (value?.type !== "video" || !/^[a-zA-Z0-9_-]{11}$/.test(value.videoId ?? "") || !value.title) return [];
    const image = value.videoThumbnails?.find((thumbnail) => thumbnail.url)?.url;
    return [{
      id: value.videoId!,
      title: value.title,
      artists: [{ id: value.authorId ?? "", name: value.author || "YouTube" }],
      durationMs: Math.max(0, Number(value.lengthSeconds) || 0) * 1000,
      ...(image ? { cover: { url: absoluteUrl(image), width: 480, height: 360 } } : {}),
    }];
  });
}

const AUDIO_ITAGS = [251, 140, 250, 249, 139];

export async function resolveInvidiousAudioStream(
  videoId: string,
  signal?: AbortSignal,
): Promise<ResolvedAudioStream> {
  const response = await fetch(absoluteUrl(`/api/v1/videos/${encodeURIComponent(videoId)}`), {
    headers: { accept: "application/json" },
    signal: signal ?? AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Invidious video lookup returned HTTP ${response.status}.`);
  const body = await response.json() as { adaptiveFormats?: InvidiousAudioFormat[] };
  const formats = (body.adaptiveFormats ?? []).filter((format) => {
    const type = (format.type ?? "").toLowerCase();
    return Number(format.itag) > 0 && type.startsWith("audio/");
  });
  const selected = AUDIO_ITAGS.map((itag) => formats.find((format) => Number(format.itag) === itag)).find(Boolean)
    ?? formats.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0))[0];
  if (!selected?.type || !selected.itag) throw new Error("Invidious returned no playable audio format.");

  const streamUrl = new URL("/latest_version", INVIDIOUS_BASE_URL);
  streamUrl.searchParams.set("id", videoId);
  streamUrl.searchParams.set("itag", String(selected.itag));
  streamUrl.searchParams.set("local", "true");
  const mimeType = selected.type.split(";")[0]?.trim() || "audio/webm";
  const opus = /opus|webm/i.test(selected.type);
  const contentLength = Number(selected.clen);
  return {
    url: streamUrl.toString(),
    mimeType,
    codec: opus ? "opus" : "aac",
    bitrate: Number(selected.bitrate) || 128_000,
    itag: Number(selected.itag),
    expiresAt: null,
    ...(Number.isFinite(contentLength) && contentLength > 0 ? { contentLength } : {}),
  };
}
