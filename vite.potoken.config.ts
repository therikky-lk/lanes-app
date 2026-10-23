// Bundles android-web/potoken.ts into one script the Android app injects into
// its hidden YouTube WebView (LanePoTokenPlugin.java).
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "android/app/src/main/assets",
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: "android-web/potoken.ts",
      formats: ["iife"],
      name: "LanePoToken",
      fileName: () => "lane-potoken.js",
    },
  },
});
