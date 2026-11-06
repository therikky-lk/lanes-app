import { Capacitor, registerPlugin } from "@capacitor/core";
import { api } from "@/shared/api";
import type { ShareEntityType, ShareSnapshot } from "@/shared/contracts/sharing";
export type { ShareEntityType } from "@/shared/contracts/sharing";
export const SHARE_BASE_URL = "https://lane-app.site";

const nativeShare = registerPlugin<{ share(input: { title: string; url: string }): Promise<void> }>("LaneShare");

export async function shareEntity(type: ShareEntityType, entityId: string, snapshot: ShareSnapshot): Promise<"shared" | "copied" | "cancelled"> {
  const { url } = await api.createShare({ type, entityId, snapshot });
  if (Capacitor.getPlatform() === "android") {
    await nativeShare.share({ title: snapshot.title, url });
    return "shared";
  }
  if (navigator.share) {
    try { await navigator.share({ title: snapshot.title, url }); return "shared"; }
    catch (error) { if (error instanceof Error && error.name === "AbortError") return "cancelled"; }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}
