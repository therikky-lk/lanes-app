import { tryFetchText } from "@/shared/api/tryFetch";

const SOUNDCLOUD_HOME = "https://soundcloud.com";
const SCRIPT_URL = /src="((?:https:)?\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g;
const CLIENT_ID_PATTERN = /client_id\s*[:=]\s*"([a-zA-Z0-9]{32})"/;
const DISCOVERY_RETRY_MS = 60_000;

let cachedSoundCloudClientId: string | undefined;
let discovery: Promise<string | undefined> | undefined;
let retryAfter = 0;

export function rememberSoundCloudClientId(clientId: string): void {
  cachedSoundCloudClientId = clientId;
  retryAfter = 0;
}

export function resetSoundCloudClientIdCache(): void {
  cachedSoundCloudClientId = undefined;
  discovery = undefined;
  retryAfter = 0;
}

function scriptUrlsFromHtml(html: string): string[] {
  return [...html.matchAll(SCRIPT_URL)].map((match) => (match[1].startsWith("//") ? `https:${match[1]}` : match[1]));
}

async function discoverSoundCloudClientId(signal?: AbortSignal): Promise<string | undefined> {
  const html = await tryFetchText(SOUNDCLOUD_HOME, { headers: { accept: "text/html,application/xhtml+xml" }, signal });
  for (const scriptUrl of html ? scriptUrlsFromHtml(html).reverse() : []) {
    const found = (await tryFetchText(scriptUrl, { signal }))?.match(CLIENT_ID_PATTERN)?.[1];
    if (found) return found;
  }
  return undefined;
}

async function discoverOnce(signal?: AbortSignal): Promise<string | undefined> {
  signal?.throwIfAborted();
  if (Date.now() < retryAfter) return undefined;
  if (!discovery) {
    const pending = discoverSoundCloudClientId(AbortSignal.timeout(10_000)).catch(() => undefined).then(found => {
      if (discovery === pending) {
        discovery = undefined;
        if (found) cachedSoundCloudClientId ??= found;
        else retryAfter = Date.now() + DISCOVERY_RETRY_MS;
      }
      return cachedSoundCloudClientId ?? found;
    });
    discovery = pending;
  }
  const found = await discovery;
  signal?.throwIfAborted();
  return found;
}

export async function getSoundCloudClientId(configuredClientId?: string, signal?: AbortSignal): Promise<string> {
  if (configuredClientId?.trim()) return configuredClientId.trim();
  if (cachedSoundCloudClientId) return cachedSoundCloudClientId;
  const discovered = await discoverOnce(signal);
  if (!discovered) throw new Error("SoundCloud is unavailable right now, try again later.");
  return discovered;
}

export async function refreshSoundCloudClientId(rejectedClientId: string, signal?: AbortSignal): Promise<string | undefined> {
  if (cachedSoundCloudClientId === rejectedClientId) cachedSoundCloudClientId = undefined;
  if (cachedSoundCloudClientId) return cachedSoundCloudClientId;
  const discovered = await discoverOnce(signal);
  if (discovered === rejectedClientId) {
    cachedSoundCloudClientId = undefined;
    retryAfter = Date.now() + DISCOVERY_RETRY_MS;
  }
  return discovered && discovered !== rejectedClientId ? discovered : undefined;
}
