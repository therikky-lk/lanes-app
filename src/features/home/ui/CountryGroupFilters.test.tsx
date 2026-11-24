import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "@/languages/I18nProvider";
import { CountryGroupSelect } from "./CountryGroupFilters";

it("uses the shared app dropdown instead of the native Android select", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  try {
    await act(async () => {
      root.render(<I18nProvider><CountryGroupSelect value="europe" onChange={onChange} /></I18nProvider>);
    });
    expect(host.querySelector("select")).toBeNull();
    const trigger = host.querySelector<HTMLButtonElement>("button[aria-haspopup='listbox']")!;
    await act(async () => trigger.click());
    const options = [...document.querySelectorAll<HTMLButtonElement>("[role='listbox'] [role='option']")];
    expect(options).toHaveLength(5);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    await act(async () => options[1].click());
    expect(onChange).toHaveBeenCalledWith("asia");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
