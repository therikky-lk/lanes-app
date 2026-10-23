// Runs inside Lane's hidden Android WebView on https://www.youtube.com/robots.txt
// (see LanePoTokenPlugin.java) and mints BotGuard PO tokens the same way the
// desktop app's hidden window does (electron/potoken-preload.ts).
// Build: pnpm build:potoken  ->  android/app/src/main/assets/lane-potoken.js
import { BotGuardClient } from "bgutils-js/botguard";
import { buildURL, GOOG_API_KEY } from "bgutils-js/utils";
import { WebPoMinter } from "bgutils-js/webpo";

interface Bridge {
  ready(): void;
  result(id: number, token: string, error: string): void;
  interpreter(id: number, url: string): void;
}

const bridge = (window as unknown as { LanePo: Bridge }).LanePo;
const REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";
const REFRESH_MARGIN_MS = 10 * 60 * 1000;
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;
const WEB_CLIENT_VERSION = "2.20250925.01.00";

let current: { minter: WebPoMinter; expiresAt: number } | null = null;
let pending: Promise<{ minter: WebPoMinter; expiresAt: number }> | null = null;
let nextInterpreter = 1;
const interpreterWaiters = new Map<number, { resolve: (s: string) => void; reject: (e: Error) => void }>();

(window as unknown as Record<string, unknown>).__laneInterpreter = (id: number, script: string | null, error: string | null) => {
  const waiter = interpreterWaiters.get(id);
  if (!waiter) return;
  interpreterWaiters.delete(id);
  if (script) waiter.resolve(script);
  else waiter.reject(new Error(error || "interpreter download failed"));
};

function downloadInterpreter(url: string): Promise<string> {
  const id = nextInterpreter++;
  return new Promise((resolve, reject) => {
    interpreterWaiters.set(id, { resolve, reject });
    bridge.interpreter(id, url);
  });
}

async function createMinter() {
  const response = await fetch("/youtubei/v1/att/get?prettyPrint=false", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: WEB_CLIENT_VERSION, hl: "en", gl: "US" } },
      engagementType: "ENGAGEMENT_TYPE_UNBOUND",
    }),
  });
  if (!response.ok) throw new Error(`att/get returned ${response.status}`);
  const challenge = ((await response.json()) as {
    bgChallenge?: {
      interpreterUrl?: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string };
      program?: string;
      globalName?: string;
    };
  }).bgChallenge;
  const interpreterUrl = challenge?.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
  if (!interpreterUrl || !challenge?.program || !challenge.globalName) throw new Error("BotGuard challenge is missing");

  const script = await downloadInterpreter(`https:${interpreterUrl}`);
  new Function(script)();
  const botguard = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: globalThis,
  });
  const webPoSignalOutput: Parameters<typeof WebPoMinter.create>[1] = [];
  const botguardResponse = await botguard.snapshot({ webPoSignalOutput });
  const it = await fetch(buildURL("GenerateIT", true), {
    method: "POST",
    headers: {
      "content-type": "application/json+protobuf",
      "x-goog-api-key": GOOG_API_KEY,
      "x-user-agent": "grpc-web-javascript/0.1",
    },
    body: JSON.stringify([REQUEST_KEY, botguardResponse]),
  });
  if (!it.ok) throw new Error(`GenerateIT returned ${it.status}`);
  const [integrityToken, ttlSeconds] = (await it.json()) as [string | null, number?];
  if (!integrityToken) throw new Error("GenerateIT returned no integrity token");
  const minter = await WebPoMinter.create({ integrityToken }, webPoSignalOutput);
  const ttlMs = (typeof ttlSeconds === "number" && ttlSeconds > 0 ? ttlSeconds : DEFAULT_TTL_SECONDS) * 1000;
  return { minter, expiresAt: Date.now() + Math.max(ttlMs - REFRESH_MARGIN_MS, 60_000) };
}

async function getMinter() {
  if (current && Date.now() < current.expiresAt) return current;
  if (!pending) {
    pending = createMinter()
      .then((entry) => {
        current = entry;
        return entry;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

(window as unknown as Record<string, unknown>).__laneMint = async (id: number, identifier: string) => {
  try {
    const entry = await getMinter();
    const token = await entry.minter.mintAsWebsafeString(identifier);
    bridge.result(id, token, "");
  } catch (error) {
    current = null;
    bridge.result(id, "", error instanceof Error ? error.message : String(error));
  }
};

bridge.ready();
