import { describe, expect, it } from "vitest";
import { iosKeyboardInsets } from "./iosLayout";

describe("iOS keyboard inset", () => {
  it("subtracts the obscured part of the viewport for an editable field", () => {
    expect(iosKeyboardInsets(874, 506, 24, 1, true)).toEqual({ top: 24, bottom: 344 });
  });

  it("does not treat pinch zoom, blur or a native resize as a keyboard overlay", () => {
    const none = { top: 0, bottom: 0 };
    expect(iosKeyboardInsets(874, 506, 24, 1.15, true)).toEqual(none);
    expect(iosKeyboardInsets(874, 506, 24, 1, false)).toEqual(none);
    expect(iosKeyboardInsets(506, 506, 0, 1, true)).toEqual(none);
  });
});
