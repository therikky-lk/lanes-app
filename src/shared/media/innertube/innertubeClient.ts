import { recordPlaybackRateLimit, requirePlaybackProvider } from "@/shared/media/playbackRateLimit";
import { isConnectionLoss } from "@/shared/utils/networkRetry";
import { getClientVisitorData } from "@/shared/api/visitorSession";
import { getApiBaseUrl } from "@/shared/api/baseUrl";
import { getYoutubeAuthorization, getYoutubePageId } from "../youtube/auth/youtubeAuthSession";

export type InnertubeEndpoint = "search" | "browse" | "next" | "player" | "account/accounts_list";

export interface InnertubeProfile {
  clientName: string;
  clientVersion: string;
  clientIdHeader: string;
  origin: string;
  userAgent?: string;
  includeUserAgentInContext?: boolean;
  requiresJsPlayer?: boolean;
  acceptsOAuth?: boolean;
  extraContext?: Record<string, string | number>;
}

export const WEB_REMIX_PROFILE: InnertubeProfile = {
  clientName: "WEB_REMIX",
  clientVersion: "1.20260911.08.00",
  clientIdHeader: "67",
  origin: "https://music.youtube.com",
};

export const YOUTUBE_WEB_PROFILE: InnertubeProfile = {
  clientName: "WEB",
  clientVersion: "2.20260911.00.00",
  clientIdHeader: "1",
  origin: "https://www.youtube.com",
};

export const USER_AGENT_HEADER_OVERRIDE = "x-liner-user-agent";

export class InnertubeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "InnertubeError";
  }
}

export interface InnertubeRequestOptions {
  profile?: InnertubeProfile;
  signal?: AbortSignal;
}

function buildClientContext(profile: InnertubeProfile, visitorData: string): Record<string, unknown> {
  return {
    clientName: profile.clientName,
    clientVersion: profile.clientVersion,
    hl: "en",
    gl: "US",
    ...(visitorData ? { visitorData } : {}),
    ...(profile.includeUserAgentInContext && profile.userAgent ? { userAgent: profile.userAgent } : {}),
    ...profile.extraContext,
  };
}

function buildHeaders(profile: InnertubeProfile, visitorData: string, authorization: string | null): Record<string, string> {
  return {
    ...(authorization ? { authorization } : {}),
    "content-type": "application/json",
    accept: "application/json",
    "x-youtube-client-name": profile.clientIdHeader,
    "x-youtube-client-version": profile.clientVersion,
    "x-origin": profile.origin,
    ...(visitorData ? { "x-goog-visitor-id": visitorData } : {}),
    ...(profile.userAgent ? { [USER_AGENT_HEADER_OVERRIDE]: profile.userAgent } : {}),
  };
}

export async function postInnertube(
  endpoint: InnertubeEndpoint,
  body: Record<string, unknown>,
  options: InnertubeRequestOptions = {},
): Promise<unknown> {
  if (endpoint === "player") requirePlaybackProvider("youtube");
  const profile = options.profile ?? WEB_REMIX_PROFILE;
  const visitorData = await getClientVisitorData().catch(() => "");
  const authorization = profile.acceptsOAuth
    ? await getYoutubeAuthorization(options.signal).catch(() => null)
    : null;
  const url = `${profile.origin}/youtubei/v1/${endpoint}?prettyPrint=false`;
  const runtime = typeof window === "undefined" ? null : window as Window & {
    linerElectron?: unknown;
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  // Browsers need the public catalog transport even on secure localhost/HTTPS.
  // Only native clients can send YouTube's required Origin/UA headers directly.
  const browserTransport = Boolean(runtime && !runtime.linerElectron && !runtime.Capacitor?.isNativePlatform?.());
  const previewCatalog = import.meta.env.DEV && (endpoint === "search" || endpoint === "browse");
  const requestUrl = browserTransport && !authorization
    ? previewCatalog ? `/__lane/catalog/${endpoint}` : `${getApiBaseUrl()}/v1/public/youtube/innertube/${endpoint}`
    : url;
  const payload = {
    ...body,
    context: {
      client: buildClientContext(profile, visitorData),
      user: {
        lockedSafetyMode: false,
        ...(authorization && getYoutubePageId() ? { onBehalfOfUser: getYoutubePageId() } : {}),
      },
    },
  };

  const request = () => fetch(requestUrl, {
    method: "POST",
    headers: browserTransport && !authorization
      ? { "content-type": "application/json", accept: "application/json" }
      : buildHeaders(profile, visitorData, authorization),
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  let response: Response;
  try {
    response = await request().catch(async error => {
      if (options.signal?.aborted || endpoint !== "player" || !isConnectionLoss(error)) throw error;
      await new Promise<void>(resolve => setTimeout(resolve, 300));
      options.signal?.throwIfAborted();
      return request();
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new InnertubeError("YouTube Music is unreachable.", 0);
  }

  if (endpoint === "player" && response.status === 429) {
    await response.body?.cancel().catch(() => undefined);
    throw recordPlaybackRateLimit(response, "youtube");
  }

  if (!response.ok) {
    throw new InnertubeError(`YouTube Music ${endpoint} failed with HTTP ${response.status}.`, response.status);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new InnertubeError(`YouTube Music ${endpoint} returned invalid JSON.`, 502);
  }
}
