import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, useTheme } from "next-themes";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

let root: Root;
let container: HTMLDivElement;
let systemDark: boolean;
let listeners: Set<(event: { matches: boolean }) => void>;
let selectTheme: (theme: string) => void;

function ThemeControl() {
  selectTheme = useTheme().setTheme;
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-color-theme");
  systemDark = false;
  listeners = new Set();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() { return query === "(prefers-color-scheme: dark)" && systemDark; },
    media: query,
    addListener: (listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeListener: (listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => {
    root.render(
      <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
        <ThemeControl />
      </ThemeProvider>,
    );
  });
}

async function changeSystem(dark: boolean) {
  await act(async () => {
    systemDark = dark;
    for (const listener of listeners) listener({ matches: dark });
  });
}

it("defaults to the system, not a forced dark preset", () => {
  const app = readFileSync(`${process.cwd()}/src/app/App.tsx`, "utf8");
  expect(app).toMatch(/defaultTheme="system"/);
  expect(app).toMatch(/enableSystem=\{true\}/);
});

it("starts light on a light system and follows OS changes", async () => {
  await mount();
  expect(document.documentElement.dataset.theme).toBe("light");
  await changeSystem(true);
  expect(document.documentElement.dataset.theme).toBe("dark");
  await changeSystem(false);
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("starts dark only when the system is dark", async () => {
  systemDark = true;
  await mount();
  expect(document.documentElement.dataset.theme).toBe("dark");
});

it.each(["light", "dark"] as const)("respects and saves the explicit %s choice", async (preset) => {
  await mount();
  await act(async () => selectTheme(preset));
  expect(localStorage.getItem("theme")).toBe(preset);
  await changeSystem(true);
  await changeSystem(false);
  expect(document.documentElement.dataset.theme).toBe(preset);
  await act(async () => selectTheme("system"));
  expect(document.documentElement.dataset.theme).toBe("light");
});

it.each(["light", "dark"] as const)("restores a saved %s choice on startup", async (preset) => {
  localStorage.setItem("theme", preset);
  systemDark = preset === "light";
  await mount();
  expect(document.documentElement.dataset.theme).toBe(preset);
});
