import { describe, expect, it } from "vitest";
import { deriveKeys, generatePairingCode, normalizePairingCode, open, seal } from "./connectCrypto";

describe("lane connect crypto", () => {
  it("round-trips messages and rejects other codes", async () => {
    const code = generatePairingCode();
    expect(normalizePairingCode(code.toLowerCase().replace(/-/g, " "))).toBe(code);
    const a = await deriveKeys(code);
    const b = await deriveKeys(code);
    expect(a.topic).toBe(b.topic);
    const sealed = await seal(a.key, { hello: "world" });
    expect(await open(b.key, sealed)).toEqual({ hello: "world" });
    const other = await deriveKeys(generatePairingCode());
    expect(await open(other.key, sealed)).toBeNull();
  });
});
