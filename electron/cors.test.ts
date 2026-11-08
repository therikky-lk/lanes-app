import { describe, expect, it } from "vitest";
import { keepsOwnCors, needsOpenCors, withOpenCors } from "./cors";

describe("scoped CORS policy", () => {
  it("allows only listed service domains and their subdomains", () => {
    expect(needsOpenCors("https://music.youtube.com/watch?v=1")).toBe(true);
    expect(needsOpenCors("https://r2.cloudflarestorage.com/audio")).toBe(true);
    expect(needsOpenCors("https://youtube.com.attacker.example/" )).toBe(false);
    expect(needsOpenCors("https://unrelated.example/" )).toBe(false);
    expect(needsOpenCors("http://localhost:5173/api", true)).toBe(true);
    expect(needsOpenCors("http://localhost:5173/api", false)).toBe(false);
  });

  it("does not replace CORS headers for unlisted hosts or credentialed first-party responses", () => {
    const headers = { "content-type": ["application/json"], "access-control-allow-credentials": ["true"] };
    expect(keepsOwnCors("https://api.tryliner.fun/v1/me")).toBe(true);
    expect(withOpenCors(headers, "GET", true)).toEqual({ responseHeaders: headers });
  });

  it("normalizes provider CORS headers and returns a successful preflight", () => {
    const result = withOpenCors({ "Access-Control-Allow-Origin": ["https://old.example"], "content-type": ["audio/mpeg"] }, "OPTIONS");
    expect(result.statusLine).toBe("HTTP/1.1 200 OK");
    expect(result.responseHeaders["access-control-allow-origin"]).toEqual(["*"]);
    expect(result.responseHeaders["content-type"]).toEqual(["audio/mpeg"]);
  });
});
