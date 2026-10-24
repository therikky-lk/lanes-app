import { initTelemetry } from "@/shared/telemetry";
import { initBackgroundStorageAnalytics } from "@/shared/utils/cacheManager";
import { initClientVisitorSession } from "@/shared/api/visitorSession";
import { initBundleStampLog } from "@/shared/utils/bundleStampLog";
import { initLocalPlaylistTracks } from "@/features/local/localPlaylistTracks";

export function initMainWindowServices() {
  initTelemetry();
  initBackgroundStorageAnalytics();
  initClientVisitorSession();
  initBundleStampLog();
  initLocalPlaylistTracks();
}
