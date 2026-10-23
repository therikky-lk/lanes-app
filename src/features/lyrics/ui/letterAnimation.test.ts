import { afterEach, describe, expect, it, vi } from "vitest";
import { attachLetterAnimation } from "./letterAnimation";

function word(text: string, time: number, duration: number, highlight = false): string {
  const cls = highlight ? "blyrics--word blyrics-word-highlight" : "blyrics--word";
  return `<span class="${cls}" data-time="${time}" data-duration="${duration}" data-content="${text}">${text}</span>`;
}

function line(active: boolean): string {
  const words = (hl: boolean) => `${word("abcd", 10, 1, hl)} ${word("xy", 11, 0.5, hl)}`;
  return `<div class="blyrics--line${active ? " blyrics--active" : ""}"><div class="blyrics-line-main">
    <span class="blyrics-bidi-run blyrics-highlight-run">${words(true)}</span>
    <span class="blyrics-bidi-run">${words(false)}</span>
  </div></div>`;
}

describe("letter-by-letter lyrics", () => {
  let frames: FrameRequestCallback[] = [];
  const flush = () => {
    const run = frames;
    frames = [];
    run.forEach((cb) => cb(0));
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    frames = [];
  });

  it("splits timed words into letters and lights them with the song", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const host = document.createElement("div") as HTMLElement & { currentTime: number };
    host.innerHTML = line(true);
    document.body.appendChild(host);
    host.currentTime = 0;
    const detach = attachLetterAnimation(host);
    flush(); // scan + first frame

    const litLetters = host.querySelectorAll(".blyrics-highlight-run .lane-ch");
    const baseLetters = host.querySelectorAll(".blyrics-bidi-run:not(.blyrics-highlight-run) .lane-ch");
    expect(litLetters).toHaveLength(6);
    expect(baseLetters).toHaveLength(6);

    // halfway through "abcd" (the lead puts 10.35 + 0.15 at 50%)
    host.currentTime = 10.35;
    flush();
    const lit = () => Array.from(litLetters).map((el) => (el.classList.contains("lane-ch-lit") ? 1 : 0)).join("");
    expect(lit()).toBe("110000");

    host.currentTime = 12;
    flush();
    expect(lit()).toBe("111111");

    // line no longer current: letters go dark again
    host.querySelector(".blyrics--line")!.classList.remove("blyrics--active");
    flush();
    expect(lit()).toBe("000000");
    detach();
  });
});
