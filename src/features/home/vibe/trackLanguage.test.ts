import { describe, expect, it } from "vitest";
import { scriptVerdict } from "./trackLanguage";

describe("scriptVerdict", () => {
  it("tells Russian from Ukrainian and English", () => {
    expect(scriptVerdict("Я иду по городу, и ветер в лицо, мы снова здесь, это всё моё")).toBe("russian");
    expect(scriptVerdict("Я йду містом, і вітер в обличчя, ми знову тут, це все моє, їй")).toBe("other");
    expect(scriptVerdict("I walk the city streets tonight and the wind is in my face")).toBe("foreign");
  });

  it("isn't thrown by a stray letter in a Russian song", () => {
    expect(scriptVerdict("Мы снова здесь и это всё наше, ты слышишь? Это ёлка, а это Київ")).toBe("russian");
  });
});
