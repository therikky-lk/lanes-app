// Integration test: real @xhayper/discord-rpc against a fake Discord IPC socket.
import { afterEach, describe, expect, it, vi } from "vitest";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("electron", () => ({ ipcMain: { on: vi.fn(), handle: vi.fn() } }));

type Frame = { op: number; data: any };

function encode(op: number, data: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(data));
  const head = Buffer.alloc(8);
  head.writeUInt32LE(op, 0);
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

function startFakeDiscord(socketPath: string, frames: Frame[]) {
  fs.mkdirSync(path.dirname(socketPath), { recursive: true });
  try { fs.unlinkSync(socketPath); } catch {}
  const conns = new Set<net.Socket>();
  const server = net.createServer((sock) => {
    conns.add(sock);
    sock.on("close", () => conns.delete(sock));
    sock.on("error", () => {});
    let buf = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 8) {
        const op = buf.readUInt32LE(0);
        const len = buf.readUInt32LE(4);
        if (buf.length < len + 8) break;
        const data = JSON.parse(buf.subarray(8, 8 + len).toString() || "null");
        buf = buf.subarray(8 + len);
        frames.push({ op, data });
        if (op === 0) {
          sock.write(encode(1, { cmd: "DISPATCH", evt: "READY", data: { v: 1, user: { id: "1", username: "fedora", discriminator: "0" }, config: {} } }));
        } else if (op === 3) {
          sock.write(encode(4, data));
        } else if (op === 1) {
          sock.write(encode(1, { cmd: data.cmd, nonce: data.nonce, data: data.args?.activity ?? null, evt: null }));
        }
      }
    });
  });
  (server as any).closeAllConnections = () => conns.forEach((c) => c.destroy());
  return new Promise<net.Server>((r) => server.listen(socketPath, () => r(server)));
}

describe("discord rpc over real IPC", () => {
  let server: net.Server | undefined;
  let mgr: any;
  afterEach(() => { mgr?.destroy(); server?.close(); });

  for (const sub of ["", "app/com.discordapp.Discord", "app/io.github.equicord.equibop", "app/app.legcord.Legcord"]) {
    it(`connects and sets activity via ${sub || "root"} socket`, async () => {
      const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "xdg-"));
      process.env.XDG_RUNTIME_DIR = runtime;
      const frames: Frame[] = [];
      server = await startFakeDiscord(path.join(runtime, sub, "discord-ipc-0"), frames);
      vi.resetModules();
      const { DiscordRpcManager } = await import("./discord");
      mgr = new DiscordRpcManager();
      mgr.updateState({
        status: "playing",
        track: { id: "abc", title: "Song", artist: "Artist", coverUrl: "https://i.ytimg.com/vi/x/hq.jpg", durationMs: 200000 },
        positionMs: 1000, durationMs: 200000,
      });
      await vi.waitFor(() => expect(frames.some((f) => f.data?.cmd === "SET_ACTIVITY")).toBe(true), { timeout: 15000, interval: 200 });
      const act = frames.find((f) => f.data?.cmd === "SET_ACTIVITY")!.data.args.activity;
      console.log(JSON.stringify(act));
      expect(act.type).toBe(2);
      expect(act.details).toBe("Song");
    }, 20000);
  }
});

describe("discord restart", () => {
  it("reconnects after Discord quits and comes back", async () => {
    const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "xdg-"));
    process.env.XDG_RUNTIME_DIR = runtime;
    const sock = path.join(runtime, "discord-ipc-0");
    const frames1: Frame[] = [];
    let server = await startFakeDiscord(sock, frames1);
    vi.resetModules();
    const { DiscordRpcManager } = await import("./discord");
    const mgr: any = new DiscordRpcManager();
    await vi.waitFor(() => expect(mgr.isConnected).toBe(true), { timeout: 10000, interval: 100 });
    // Discord quits: drop the server and every open connection
    (server as any).closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
    await vi.waitFor(() => expect(mgr.isConnected).toBe(false), { timeout: 5000, interval: 100 });
    const frames2: Frame[] = [];
    server = await startFakeDiscord(sock, frames2);
    await vi.waitFor(() => expect(mgr.isConnected).toBe(true), { timeout: 15000, interval: 200 });
    expect(frames2.some((f) => f.op === 0)).toBe(true);
    mgr.destroy();
    server.close();
  }, 30000);
});
