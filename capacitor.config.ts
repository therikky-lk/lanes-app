import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.therikky.lane",
  appName: "Lane",
  webDir: process.env.LANE_TARGET === "ios" ? "dist-ios" : process.env.LANE_AUTH_DIAGNOSTICS === "1"
    ? process.env.LANE_AUTH_DIAGNOSTICS_WEB_DIR || "dist-android"
    : "dist-android",
  backgroundColor: "#0d0d10",
  ...(process.env.LANE_AUTH_DIAGNOSTICS === "1" ? { loggingBehavior: "none" as const } : {}),
  android: {
    // media streams and APIs are plain https; nothing needs mixed content
    allowMixedContent: false,
    includePlugins: ["@capacitor/app"],
  },
  ios: {
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
  },
  plugins: {
    // route fetch/XHR through native HTTP: no CORS limits, custom headers allowed
    CapacitorHttp: { enabled: true },
    // edge-to-edge is handled by MainActivity (--lane-safe-* CSS vars)
    SystemBars: { insetsHandling: "disable", style: "DARK" },
  },
};

export default config;
