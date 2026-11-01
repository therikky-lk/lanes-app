import type { InnertubeProfile } from "./innertubeClient";

const TV_USER_AGENT =
  "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)";

export const TV_PROFILE: InnertubeProfile = {
  clientName: "TVHTML5",
  clientVersion: "7.20260707.07.00",
  clientIdHeader: "7",
  origin: "https://www.youtube.com",
  userAgent: TV_USER_AGENT,
  includeUserAgentInContext: true,
  requiresJsPlayer: true,
};

export const TV_ACCOUNT_PROFILE: InnertubeProfile = {
  ...TV_PROFILE,
  acceptsOAuth: true,
};

export const VISIONOS_PROFILE: InnertubeProfile = {
  clientName: "VISIONOS",
  clientVersion: "1.04",
  clientIdHeader: "101",
  origin: "https://music.youtube.com",
  userAgent: "com.google.visionos.youtube/1.04(RealityDevice17,1; U; CPU visionOS 26_6_0 like Mac OS X; en_US)",
  extraContext: {
    osName: "visionOS",
    osVersion: "26.6.0.23O770",
    deviceMake: "Apple",
    deviceModel: "RealityDevice17,1",
    platform: "MOBILE",
  },
};

export const ANDROID_VR_PROFILE: InnertubeProfile = {
  clientName: "ANDROID_VR",
  clientVersion: "1.65.10",
  clientIdHeader: "28",
  origin: "https://www.youtube.com",
  userAgent:
    "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
  includeUserAgentInContext: true,
  extraContext: {
    osName: "Android",
    osVersion: "12L",
    deviceMake: "Oculus",
    deviceModel: "Quest 3",
    androidSdkVersion: 32,
    buildId: "SQ3A.220605.009.A1",
    packageName: "com.google.android.apps.youtube.vr.oculus",
  },
};

export const PLAYBACK_PROFILES: readonly InnertubeProfile[] = [VISIONOS_PROFILE, ANDROID_VR_PROFILE];
