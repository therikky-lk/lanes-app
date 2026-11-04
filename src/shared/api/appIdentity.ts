import pkg from "../../../package.json";
import { APP_VERSION } from "../config/version";

/** The Liner API requires the desktop client identity even on native Android.
 * Keep the device UA and add the same compatibility tokens as local preview.
 */
export function appApiUserAgent(deviceUserAgent: string, electronVersion = pkg.devDependencies.electron.replace(/^[~^]/, "")): string {
  return `${deviceUserAgent} ${pkg.name}/${APP_VERSION} Electron/${electronVersion}`;
}
