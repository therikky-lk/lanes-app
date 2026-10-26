import React from "react";
import ReactDOM from "react-dom/client";
import { initGlobalErrorHandlers } from "@/shared/utils/globalErrorHandlers";
import { installNativeFetchHeaders } from "@/shared/platform/native";
import { installAndroidBackButton } from "@/shared/platform/androidBack";
import { isLowEndDevice } from "@/shared/platform/deviceTier";

initGlobalErrorHandlers();
installNativeFetchHeaders();
void installAndroidBackButton();
// weak phones: cheaper blur and animations (see globals.css .lane-low-end)
document.documentElement.classList.toggle("lane-low-end", isLowEndDevice());

const isOverlay = window.location.hash.startsWith("#/overlay");

async function loadRoot(): Promise<React.ReactElement> {
  if (isOverlay) {
    const { default: OverlayApp } = await import("./app/OverlayApp");
    return <OverlayApp />;
  }
  const [{ initMainWindowServices }, { default: App }, { default: RootErrorBoundary }] = await Promise.all([
    import("./app/mainWindowServices"),
    import("./app/App"),
    import("@/shared/ui/RootErrorBoundary"),
  ]);
  initMainWindowServices();
  return (
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}

const rootElement = document.getElementById("root");

if (rootElement) {
  void loadRoot().then((root) => {
    ReactDOM.createRoot(rootElement).render(<React.StrictMode>{root}</React.StrictMode>);
  });
}
