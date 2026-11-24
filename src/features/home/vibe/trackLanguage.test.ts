import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Track } from "@/shared/types/track";
import { OTHER_VIBE_LANGUAGES, vibeRegionForLanguage } from "./vibeLanguages";

const track = (id: string, title = "Песня"): Track => ({
  id, title, artists: "Исполнитель", coverUrl: "", durationMs: 180000, playCount: 0,
});
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("has one tile per region and migrates grouped language selections", () => {
  const countries = Object.values(OTHER_VIBE_LANGUAGES).map(([, country]) => country);
  expect(new Set(countries).size).toBe(countries.length);
  expect(vibeRegionForLanguage("gu")).toBe("hi");
  expect(vibeRegionForLanguage("jv")).toBe("id");
});

it("releases the caller at the deadline even if native fetch ignores abort", async () => {
  const fetch = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetch);
  const { languageFilter } = await import("./trackLanguage");
  const song = track("hanging");
  const request = languageFilter([song, song], "russian", [], 100);
  await vi.advanceTimersByTimeAsync(100);
  const predicate = await request;
  expect(predicate(song, false)).toBe(true);
  expect(fetch).toHaveBeenCalledOnce();
});

it("does no network work with an exhausted language budget", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { languageFilter } = await import("./trackLanguage");
  await languageFilter([track("no-budget")], "russian", [], 0);
  expect(fetch).not.toHaveBeenCalled();
});

it("accepts explicitly labelled instrumentals but not arbitrary unknown songs", async () => {
  vi.stubGlobal("fetch", vi.fn());
  const { languageFilter } = await import("./trackLanguage");
  const instrumental = track("instrumental", "Track (Instrumental)");
  const vocal = track("unknown");
  const predicate = await languageFilter([instrumental, vocal], "instrumental", [], 0);
  expect(predicate(instrumental, false)).toBe(true);
  expect(predicate(vocal, false)).toBe(false);
});

it.each([
  ["es", "Cuando miro por la ventana veo que nuestra ciudad duerme, pero yo sigo pensando en tus ojos y en las palabras que nunca te dije."],
  ["english", "I have been looking for you all my life and I know that I will never let you go again."],
  ["ukrainian", "Мені здається, що я знову бачу тебе там, де ти мене чекала."],
  ["ja", "夜空に浮かぶ星を見上げて君のことを思い出す"],
  ["et", "Ma armastan sind ja tahan alati sinu kõrval olla, sest sa oled mulle väga kallis."],
  ["vi", "Em có nghe tiếng mưa rơi ngoài hiên, lòng anh vẫn nhớ những ngày chúng ta còn bên nhau."],
  ["hi", "ఓ ప్రియతమా నీ నవ్వు చూసిన ప్రతిసారి నా మనసులో కొత్త పాట పుడుతుంది"],
  ["hi", "ನಿನ್ನ ನಗುವನ್ನು ನೋಡಿದಾಗ ನನ್ನ ಮನಸ್ಸಿನಲ್ಲಿ ಹೊಸ ಹಾಡೊಂದು ಮೂಡುತ್ತದೆ"],
])("identifies lyrics as %s", async (language, text) => {
  const { scriptVerdict } = await import("./trackLanguage");
  expect(scriptVerdict(text)).toBe(language);
});

it("keeps English, Spanish and unsupported languages separate", async () => {
  localStorage.setItem("lane_track_language_v5", JSON.stringify({ es: "es", en: "english", other: "other" }));
  const { languageFilter } = await import("./trackLanguage");
  const songs = ["es", "en", "other"].map(id => ({ ...track(id, "Amor"), artists: id }));
  const english = await languageFilter(songs, "english", [], 0);
  const spanish = await languageFilter(songs, "es", [], 0);
  expect(songs.filter(t => english(t, false)).map(t => t.id)).toEqual(["en"]);
  expect(songs.filter(t => spanish(t, false)).map(t => t.id)).toEqual(["es"]);
});
