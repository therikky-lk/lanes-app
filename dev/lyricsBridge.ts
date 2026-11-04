import type { Plugin } from "vite";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { signRequest, syncServerTime } from "../electron/crypto";
import { appApiUserAgent } from "../src/shared/api/appIdentity";
import electronPackage from "electron/package.json" with { type: "json" };

/** Local preview uses the same existing signer as the desktop app. */
export function lyricsBridge(): Plugin {
  return {
    name: "lane-local-lyrics",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const refresh = req.url === "/__lane/auth/refresh";
        if (!refresh && !req.url?.startsWith("/__lane/lyrics/")) return next();
        const remote = req.socket.remoteAddress;
        const origin = req.headers.origin;
        if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote ?? "") ||
            (origin && origin !== `http://${req.headers.host}`)) {
          res.writeHead(403).end(); return;
        }
        const url = new URL(req.url!, "http://localhost");
        const id = url.pathname.slice("/__lane/lyrics/".length);
        if (refresh ? req.method !== "POST" : (req.method !== "GET" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) {
          res.writeHead(400).end(); return;
        }
        const params = new URLSearchParams();
        for (const key of ["title", "artist", "durationMs"]) {
          const value = url.searchParams.get(key);
          if (value) params.set(key, value.slice(0, 512));
        }
        const path = refresh ? "/v1/auth/refresh" : `/v1/tracks/${id}/lyrics${params.size ? `?${params}` : ""}`;
        const controller = new AbortController();
        res.on("close", () => controller.abort());
        const timer = setTimeout(() => controller.abort(), 120_000);
        try {
          let body: string | undefined;
          if (refresh) {
            let length = 0;
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              length += chunk.length;
              if (length > 8192) { res.writeHead(413).end(); return; }
              chunks.push(Buffer.from(chunk));
            }
            body = Buffer.concat(chunks).toString("utf8");
            let payload;
            try { payload = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
            if (!payload || typeof payload.refreshToken !== "string" ||
                !payload.refreshToken || payload.refreshToken.length > 4096 ||
                Object.keys(payload).some(key => key !== "refreshToken")) {
              res.writeHead(400).end(); return;
            }
          }
          const method = refresh ? "POST" : "GET";
          const signed = await signRequest({ method, path, body });
          const headers: Record<string, string> = {
            Accept: "application/json, text/event-stream",
            ...(refresh ? { "Content-Type": "application/json" } : {}),
            // The service accepts desktop app requests; Node's default UA is
            // rejected before authentication, even with a valid signature.
            "User-Agent": appApiUserAgent(req.headers["user-agent"] ?? "Mozilla/5.0", electronPackage.version),
            "x-liner-signature": signed.signature,
            "x-liner-timestamp": String(signed.timestamp),
            "x-liner-nonce": signed.nonce,
          };
          for (const key of ["authorization", "x-request-id", "x-client-version", "x-platform", "x-session-id"]) {
            const value = req.headers[key];
            if (typeof value === "string") headers[key] = value;
          }
          const upstream = await fetch(`https://api.tryliner.fun${path}`, { method, headers, body, signal: controller.signal, redirect: "error" });
          const date = upstream.headers.get("date");
          if (date) syncServerTime(date);
          res.writeHead(upstream.status, {
            "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
            "Cache-Control": "no-store",
            ...(date ? { Date: date } : {}),
          });
          if (upstream.body) await pipeline(Readable.fromWeb(upstream.body as any), res);
          else res.end();
        } catch {
          if (!res.headersSent) res.writeHead(502).end("Lyrics service unavailable");
          else res.end();
        } finally { clearTimeout(timer); }
      });
    },
  };
}
