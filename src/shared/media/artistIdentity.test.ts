import { expect, it } from "vitest";
import { artistHref, canonicalArtistId, nativeArtistName, nativeTrackTitle, rememberArtistDisplayName, sameArtistName, uniqueArtistId } from "./artistIdentity";

it("opens the shared Danya Milohin profile from a Cyrillic track credit", () => {
  const url = new URL(artistHref("stale-id", "Даня Милохин"), "https://lane-app.site");
  expect(url.searchParams.get("id")).toBe("UCFlt4v80SainY2mhHL8sVJw");
  expect(url.searchParams.get("name")).toBe("Даня Милохин");
  expect(sameArtistName("Даня Милохин", "Danya Milohin")).toBe(true);
  expect(canonicalArtistId("other-id", "Другой артист")).toBe("other-id");
});

it("links the Ukrainian credit and the shared Khrystyna Soloviy catalog to the same artist", () => {
  const profile = "UCFpAfa7PvHFd1hejLtqAtqQ";
  expect(sameArtistName("Христина Соловій", "Khrystyna Soloviy")).toBe(true);
  expect(sameArtistName("Христина Соловій", "Христина Панасюк")).toBe(false);
  expect(canonicalArtistId("Христина Соловій")).toBe(profile);
  expect(new URL(artistHref("stale-id", "Христина Соловій"), "https://lane-app.site").searchParams.get("id")).toBe(profile);
  expect(canonicalArtistId(profile, "Khrystyna Soloviy")).toBe(profile);
});

it("matches a native Cyrillic artist name with its Latin spelling", () => {
  expect(sameArtistName("Скриптонит", "Skryptonite")).toBe(true);
  expect(sameArtistName("Мияги", "Miyagi")).toBe(true);
  expect(sameArtistName("Скриптонит", "Смоки Мо")).toBe(false);
  expect(sameArtistName("t.A.T.u.", "Тату")).toBe(true);
});

it("picks the exact spelling when duplicate artist profiles exist", () => {
  const items = [
    { type: "artist" as const, id: "real", name: "t.A.T.u." },
    { type: "artist" as const, id: "lower", name: "tatu" },
    { type: "artist" as const, id: "dotted", name: "T.a.T.U." },
  ];
  expect(uniqueArtistId(items, "t.A.T.u.")).toBe("UChTBSId6VeDfiIEuRvqTO6A");
  expect(uniqueArtistId(items, "Тату")).toBe("UChTBSId6VeDfiIEuRvqTO6A");
  expect(canonicalArtistId("UCp3m7hwydjTkRA2WrUENMWQ", "Tatu")).toBe("UCp3m7hwydjTkRA2WrUENMWQ");
  expect(uniqueArtistId([
    { type: "artist" as const, id: "one", name: "Toxi$" },
    { type: "artist" as const, id: "two", name: "Toxi$" },
  ], "Toxi$")).toBeUndefined();
});

it("leaves an ambiguous transliteration unresolved", () => {
  expect(uniqueArtistId([
    { type: "artist", id: "one", name: "Мияги" },
    { type: "artist", id: "two", name: "Мийаги" },
  ], "Miyagi")).toBeUndefined();
});

it("restores known native titles without renaming the English recording", () => {
  const credit = { name: "t.A.T.u." };
  expect(nativeTrackTitle("Nas Ne Dagoniat", credit)).toBe("Нас не догонят");
  expect(nativeTrackTitle("Ya Soshla S Uma", credit)).toBe("Я сошла с ума");
  expect(nativeTrackTitle("All The Things She Said", credit)).toBe("All The Things She Said");
  expect(nativeTrackTitle("Fortepiano", { name: "Other artist" })).toBe("Fortepiano");
});

it("links multiple Tonya Matvienko spellings to the official channel without merging Nina", () => {
  const id = "UCfmezqOwYi6svvnsXJzPoig";
  expect(canonicalArtistId("Tonya Matvienko")).toBe(id);
  expect(canonicalArtistId("UCFnY9HTzVloyLXz-3Ak--_Q")).toBe(id);
  expect(sameArtistName("Tonya Matvienko", "Ніна Матвієнко")).toBe(false);
});

it("uses a learned display name only for the confirmed account and name", () => {
  rememberArtistDisplayName("one", "Roman Yaniv", "Роман Янів");
  expect(nativeArtistName("one", "Roman Yaniv")).toBe("Роман Янів");
  expect(nativeArtistName("one", "Unrelated")).toBe("Unrelated");
  expect(nativeArtistName("two", "Roman Yaniv")).toBe("Roman Yaniv");
});
