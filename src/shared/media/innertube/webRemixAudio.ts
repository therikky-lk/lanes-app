import { diag } from "@/shared/platform/diag";
import { Innertube, Platform } from "youtubei.js/web";
import { registerPlugin } from "@capacitor/core";
import { getClientVisitorData } from "@/shared/api/visitorSession";
import { isNativeApp } from "@/shared/platform/native";

// Android: BotGuard runs in a hidden native WebView on youtube.com
const LanePoToken = registerPlugin<{ mint(options: { identifier: string }): Promise<{ token: string }> }>("LanePoToken");
import { InnertubeError } from "./innertubeClient";
import { selectBestAudioFormat, toResolvedStream, type AudioFormat, type ResolvedAudioStream } from "./innertubeAudioFormats";

interface WebRemixSession {
  visitorData: string;
  innertube: Innertube;
}

let sessionPromise: Promise<WebRemixSession> | null = null;
let evaluatorInstalled = false;

function installPlayerEvaluator(): void {
  if (evaluatorInstalled) return;
  Platform.shim.eval = async (data, env) => {
    const args = [env.n, env.sp, env.sig].map((value) => JSON.stringify(value ?? ""));
    return new Function(`${data.output}\nreturn process(${args.join(", ")});`)();
  };
  evaluatorInstalled = true;
}

/**
 * youtubei.js hands fetch Request objects; Capacitor's native HTTP bridge only
 * copes reliably with a plain url + init, so unwrap them first.
 */
async function nativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!(input instanceof Request)) return fetch(input, init);
  const headers = new Headers(input.headers);
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const method = (init?.method ?? input.method ?? "GET").toUpperCase();
  let body = init?.body ?? undefined;
  if (body === undefined && method !== "GET" && method !== "HEAD") {
    const text = await input.clone().text();
    if (text) body = text;
  }
  return fetch(input.url, { method, headers, body, signal: init?.signal ?? input.signal });
}

async function createSession(visitorData: string): Promise<WebRemixSession> {
  const innertube = await Innertube.create({
    visitor_data: visitorData,
    user_agent: navigator.userAgent,
    generate_session_locally: true,
    retrieve_player: true,
    fetch: (input, init) => (isNativeApp() ? nativeFetch(input, init) : fetch(input, init)),
  });
  return { visitorData, innertube };
}

async function getSession(visitorData: string): Promise<WebRemixSession> {
  const existing = sessionPromise ? await sessionPromise.catch(() => null) : null;
  if (existing && existing.visitorData === visitorData) return existing;
  sessionPromise = createSession(visitorData);
  sessionPromise.catch(() => {
    sessionPromise = null;
  });
  return sessionPromise;
}

export function resetWebRemixSession(): void {
  sessionPromise = null;
}

async function mintContentPoToken(videoId: string): Promise<string> {
  if (isNativeApp()) {
    try {
      const { token } = await LanePoToken.mint({ identifier: videoId });
      diag(`PO token ok (${token.length} chars)`);
      return token;
    } catch (error) {
      diag(`PO token failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  const mint = typeof window === "undefined" ? undefined : window.linerElectron?.mintPoToken;
  if (!mint) throw new InnertubeError("PO tokens need a newer Lane app version.", 501);
  return mint(videoId);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

export async function resolveWebRemixAudioStream(
  videoId: string,
  options: { signal?: AbortSignal; preferredCodec?: "opus" | "aac"; preferHighest?: boolean } = {},
): Promise<ResolvedAudioStream> {
  installPlayerEvaluator();
  const [poToken, visitorData] = await Promise.all([mintContentPoToken(videoId), getClientVisitorData()]);
  throwIfAborted(options.signal);
  const { innertube } = await getSession(visitorData);
  throwIfAborted(options.signal);
  const info = await innertube.getBasicInfo(videoId, { client: "YTMUSIC", po_token: poToken });
  throwIfAborted(options.signal);
  const status = info.playability_status?.status;
  if (status !== "OK") throw new InnertubeError(info.playability_status?.reason || `WEB_REMIX: ${status}`, 403);

  const audioFormats = (info.streaming_data?.adaptive_formats ?? []).filter(
    (format) => format.has_audio && !format.has_video && format.mime_type.startsWith("audio/"),
  );
  const candidates: AudioFormat[] = audioFormats.map((format) => ({
    itag: format.itag,
    url: "",
    mimeType: format.mime_type,
    bitrate: format.bitrate || format.average_bitrate || 0,
    ...(Number(format.content_length) > 0 ? { contentLength: Number(format.content_length) } : {}),
  }));
  const best = selectBestAudioFormat(candidates, options.preferredCodec, options.preferHighest);
  const source = best ? audioFormats.find((format) => format.itag === best.itag) : undefined;
  if (!best || !source) throw new InnertubeError("WEB_REMIX returned no audio formats.", 502);

  const deciphered = await source.decipher(innertube.session.player);
  throwIfAborted(options.signal);
  const url = new URL(deciphered);
  url.searchParams.set("pot", poToken);
  return toResolvedStream({ ...best, url: url.toString() });
}
