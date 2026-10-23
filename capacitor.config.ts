import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.therikky.lane",
  appName: "Lane",
  webDir: "dist-android",
  backgroundColor: "#0d0d10",
  android: {
    // media streams and APIs are plain https; nothing needs mixed content
    allowMixedContent: false,
  },
  plugins: {
    // route fetch/XHR through native HTTP: no CORS limits, custom headers allowed
    CapacitorHttp: { enabled: true },
    // edge-to-edge is handled by MainActivity (--lane-safe-* CSS vars)
    SystemBars: { insetsHandling: "disable", style: "DARK" },
  },
};

export default config;
