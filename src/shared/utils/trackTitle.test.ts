import { describe, expect, it } from "vitest";
import { cleanTrackTitle } from "./trackTitle";

describe("cleanTrackTitle", () => {
  it("drops the artist prefix and video junk", () => {
    expect(cleanTrackTitle("Джиган, Artik & Asti, NILETTO - Худи (Official Video)", "GeeGun, Artik & Asti, NILETTO")).toBe("Худи");
    expect(cleanTrackTitle("MACAN - Кино", "MACAN")).toBe("Кино");
  });
  it("keeps real titles alone", () => {
    expect(cleanTrackTitle("Капельки", "Ida Galich, ХЛЕБ")).toBe("Капельки");
    expect(cleanTrackTitle("Луна не знает пути (Demo Version)", "Тайпан, Agunda")).toBe("Луна не знает пути (Demo Version)");
    expect(cleanTrackTitle("Up - Down", "Someone")).toBe("Up - Down");
  });
});
