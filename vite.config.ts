import { lyricsBridge } from "./dev/lyricsBridge";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import path from "path";
import pkg from "./package.json" with { type: "json" };

export default defineConfig(({ command, mode }) => {
  if (command === "serve") {
    const devSigningSecret = loadEnv(mode, process.cwd(), "LINER_").LINER_DEV_SIGNING_SECRET;
    if (devSigningSecret) process.env.LINER_DEV_SIGNING_SECRET = devSigningSecret;
  }

  // `LANE_TARGET=android vite build`: renderer only, for the Capacitor app
  const android = process.env.LANE_TARGET === "android";

  return {
  base: android ? "./" : undefined,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    lyricsBridge(),
    react(),
    tailwindcss(),
    !android && electron({
      main: {
        entry: "electron/main.ts",
      },
      preload: {
        input: "electron/preload.ts",
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: "cjs",
                entryFileNames: "preload.cjs",
              },
            },
          },
        },
      },
    }),
  ],
  clearScreen: false,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "next/navigation": path.resolve(import.meta.dirname, "./src/lib/navigation.tsx"),
      "next/link": path.resolve(import.meta.dirname, "./src/lib/navigation.tsx"),
      "next/image": path.resolve(import.meta.dirname, "./src/components/ui/AppImage.tsx"),
    },
  },
  server: {
    // Public artist artwork lookups in the local browser preview. No account
    // headers or cookies are forwarded to the catalog provider.
    proxy: {
      "^/__lane/charts/[a-z]{2}/(50|100)$": {
        target: "https://rss.marketingtools.apple.com",
        changeOrigin: true,
        secure: true,
        rewrite: (url: string) => url.replace(/^\/__lane\/charts\/([a-z]{2})\/(50|100)$/, "/api/v2/$1/music/most-played/$2/songs.json"),
        configure: (proxy) => proxy.on("proxyReq", request => {
          request.removeHeader("authorization");
          request.removeHeader("cookie");
        }),
      },
      "^/__lane/catalog/(search|browse)$": {
        target: "https://music.youtube.com",
        changeOrigin: true,
        secure: true,
        rewrite: (url: string) => url.replace("/__lane/catalog/", "/youtubei/v1/"),
        configure: (proxy) => {
          proxy.on("proxyReq", (request) => {
            request.removeHeader("cookie");
            request.removeHeader("authorization");
            request.setHeader("origin", "https://music.youtube.com");
            request.setHeader("referer", "https://music.youtube.com/");
            request.setHeader("x-youtube-client-name", "67");
            request.setHeader("x-youtube-client-version", "1.20260911.08.00");
          });
        },
      },
    },
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  };
});
