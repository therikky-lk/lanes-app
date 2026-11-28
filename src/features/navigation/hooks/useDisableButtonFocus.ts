import { useEffect } from "react";

function isButtonElement(target: HTMLElement): boolean {
  if (target.tagName === "BUTTON") return true;
  return target.getAttribute("role") === "button";
}

export function useDisableButtonFocus(): void {
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !isButtonElement(target)) return;
      if (target.closest("[data-keep-keyboard-focus]") && target.matches(":focus-visible")) return;
      target.blur();
    };

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);
}
