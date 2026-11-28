import { rememberArtistDisplayName, sameArtistName } from "@/shared/media/artistIdentity";
import { asRecord, findFirst, trimmedString } from "@/shared/utils/json";
import { postInnertube, YOUTUBE_WEB_PROFILE } from "./innertubeClient";

const CHANNEL_ID = /^UC[\w-]{22}$/;
const cyrillic = (name: string) => /\p{Script=Cyrillic}/u.test(name);

export function readOfficialArtistName(body: unknown, channelId: string): string | undefined {
  const channel = findFirst(body, "channelMetadataRenderer");
  const title = trimmedString(channel?.title);
  if (channel?.externalId !== channelId || !title || /[–—-]\s*(topic|тема)$/i.test(title)) return;
  return title;
}

export async function learnOfficialArtistName(id: string, name: string, musicBody: unknown, signal?: AbortSignal): Promise<boolean> {
  const canonicalUrl = trimmedString(findFirst(musicBody, "microformatDataRenderer")?.urlCanonical);
  if (!canonicalUrl || !CHANNEL_ID.test(id)) return false;
  const url = new URL(canonicalUrl, "https://music.youtube.com");
  if (url.origin !== "https://music.youtube.com" || !/^\/(?:@[^/]+|channel\/UC[\w-]{22})$/.test(url.pathname)) return false;
  const timeout = AbortSignal.timeout(3200);
  const options = { profile: YOUTUBE_WEB_PROFILE, signal: signal ? AbortSignal.any([signal, timeout]) : timeout };
  let channelId = url.pathname.startsWith("/channel/") ? url.pathname.slice(9) : undefined;
  if (!channelId) {
    const resolved = asRecord(await postInnertube("navigation/resolve_url", {
      url: `https://www.youtube.com${url.pathname}`,
    }, options).catch(() => null));
    channelId = trimmedString(asRecord(asRecord(resolved?.endpoint)?.browseEndpoint)?.browseId);
  }
  // Some embedded web transports expose browse but not URL resolution. In
  // that case only use the exact channel ID the music catalog returned.
  channelId ??= id;
  if (!CHANNEL_ID.test(channelId)) return false;
  const body = await postInnertube("browse", { browseId: channelId }, options).catch(() => null);
  const official = readOfficialArtistName(body, channelId);
  if (!official || official === name || (cyrillic(name) && !cyrillic(official) && sameArtistName(name, official))) return false;
  rememberArtistDisplayName(id, name, official);
  if (channelId !== id) rememberArtistDisplayName(channelId, name, official);
  return true;
}
