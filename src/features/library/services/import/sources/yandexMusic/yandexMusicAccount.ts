import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "@/shared/platform/native";
import type { YandexMusicSignInResult } from "@/shared/media/yandexMusicOAuth";

const LaneYandexMusic = registerPlugin<{ signIn(): Promise<YandexMusicSignInResult> }>("LaneYandexMusic");

export async function signInToYandexMusic(): Promise<YandexMusicSignInResult> {
  try {
    if (isNativeApp()) return await LaneYandexMusic.signIn();
    return (await window.linerElectron?.yandexMusicSignIn?.()) ?? { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
