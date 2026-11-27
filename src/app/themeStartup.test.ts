import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const startup = html.match(/<script>([\s\S]*?)<\/script>/)![1];

function boot(saved: string | null, mobile = false, electron = false, native = false, color?: string) {
  const dataset: Record<string, string> = {};
  const storage = new Map(saved ? [["lane_theme_preset", saved]] : []);
  const variables = new Map<string, string>();
  if (color) storage.set("lane_theme_sync", JSON.stringify({ customColor: color }));
  runInNewContext(startup, {
    window: {
      linerElectron: electron ? {} : undefined,
      matchMedia: () => ({ matches: mobile }),
      Capacitor: { isNativePlatform: () => native },
    },
    document: { documentElement: { dataset, style: { setProperty: (key: string, value: string) => variables.set(key, value) } } },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  return { theme: dataset.colorTheme, saved: storage.get("lane_theme_preset"), ...(color ? { seed: variables.get("--lane-custom-seed") } : {}) };
}

describe("theme startup migration", () => {
  it.each([
    ["rose", "ruby"], ["sapphire", "violet"], ["sunset", "amber"], ["emerald", "spotify"],
    ["aurora", "system"], ["dusk", "system"], ["lagoon", "system"],
  ])("migrates %s to %s before the first paint", (previous, replacement) => {
    expect(boot(previous)).toEqual({ theme: replacement, saved: replacement });
  });
  it.each(["system", "light", "dark", "amoled", "violet", "ocean", "ruby", "amber", "coffee", "spotify", "custom"])(
    "preserves the available %s theme", (theme) => {
      expect(boot(theme)).toEqual({ theme, saved: theme });
    },
  );
  it("loads only a valid custom color before React starts", () => {
    expect(boot("custom", false, false, true, "#ff0033").seed).toBe("#ff0033");
    expect(boot("custom", false, false, true, "red").seed).toBeUndefined();
  });
  it("uses the system theme for an unknown preset", () => {
    expect(boot("unknown").theme).toBe("system");
  });
  it("replaces Liquid Glass with dark on desktop before the first paint", () => {
    expect(boot("liquid-glass")).toEqual({ theme: "dark", saved: "dark" });
    expect(boot("liquid-glass", true, true)).toEqual({ theme: "dark", saved: "dark" });
  });
  it("preserves Liquid Glass on mobile and native Android", () => {
    expect(boot("liquid-glass", true)).toEqual({ theme: "liquid-glass", saved: "liquid-glass" });
    expect(boot("liquid-glass", false, false, true)).toEqual({ theme: "liquid-glass", saved: "liquid-glass" });
  });
});
