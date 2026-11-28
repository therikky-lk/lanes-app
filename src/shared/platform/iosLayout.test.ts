import { describe, expect, it } from "vitest";
import { iosKeyboardInset } from "./iosLayout";

describe("iOS keyboard inset", () => {
  it("subtracts the obscured part of the viewport for an editable field", () => {
    expect(iosKeyboardInset(874, 506, 24, 1, true)).toBe(344);
  });

  it("does not treat pinch zoom, blur or a native resize as a keyboard overlay", () => {
    expect(iosKeyboardInset(874, 506, 24, 1.15, true)).toBe(0);
    expect(iosKeyboardInset(874, 506, 24, 1, false)).toBe(0);
    expect(iosKeyboardInset(506, 506, 0, 1, true)).toBe(0);
  });
});
