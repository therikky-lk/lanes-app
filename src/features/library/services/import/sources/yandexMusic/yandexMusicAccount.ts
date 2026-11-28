import { registerPlugin } from "@capacitor/core";
import { isAndroidApp } from "@/shared/platform/native";
import type { YandexMusicSignInResult } from "@/shared/media/yandexMusicOAuth";

const LaneYandexMusic = registerPlugin<{ signIn(): Promise<YandexMusicSignInResult> }>("LaneYandexMusic");

export async function signInToYandexMusic(): Promise<YandexMusicSignInResult> {
  try {
    if (isAndroidApp()) return await LaneYandexMusic.signIn();
    return (await window.linerElectron?.yandexMusicSignIn?.()) ?? { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
