import { initOfflineLibrary } from "@/features/library/offline/offlineLibraryStore";
import { initTelemetry } from "@/shared/telemetry";
import { initBackgroundStorageAnalytics } from "@/shared/utils/cacheManager";
import { initClientVisitorSession } from "@/shared/api/visitorSession";
import { initBundleStampLog } from "@/shared/utils/bundleStampLog";

export function initMainWindowServices() {
  initOfflineLibrary();
  initTelemetry();
  initBackgroundStorageAnalytics();
  initClientVisitorSession();
  initBundleStampLog();
}
