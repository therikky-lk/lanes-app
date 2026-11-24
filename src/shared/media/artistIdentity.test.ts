import { expect, it } from "vitest";
import { artistHref, canonicalArtistId, sameArtistName } from "./artistIdentity";

it("opens the shared Danya Milohin profile from a Cyrillic track credit", () => {
  const url = new URL(artistHref("stale-id", "Даня Милохин"), "https://lane-app.site");
  expect(url.searchParams.get("id")).toBe("UCFlt4v80SainY2mhHL8sVJw");
  expect(url.searchParams.get("name")).toBe("Даня Милохин");
  expect(sameArtistName("Даня Милохин", "Danya Milohin")).toBe(true);
  expect(canonicalArtistId("other-id", "Другой артист")).toBe("other-id");
});
