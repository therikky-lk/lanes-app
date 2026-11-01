import { useState } from "react";
import { PlayCircleLine, Playlist2Line, UserQuestionLine, YoutubeFill } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { ToggleSwitch } from "@/shared/ui";
import { signOutYoutube, useYoutubePreferences } from "@/shared/media/youtube";
import { useYoutubeAccount, useYoutubeSignInStore } from "@/features/youtube-auth";
import { SettingRow, SettingSection } from "../controls";

export function YoutubeTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const { signedIn, account, loading } = useYoutubeAccount();
  const showSignIn = useYoutubeSignInStore((state) => state.show);
  const [signingOut, setSigningOut] = useState(false);
  const accountPlayback = useYoutubePreferences((state) => state.accountPlayback);
  const setAccountPlayback = useYoutubePreferences((state) => state.setAccountPlayback);
  const promptSignIn = useYoutubePreferences((state) => state.promptSignIn);
  const setPromptSignIn = useYoutubePreferences((state) => state.setPromptSignIn);
  const syncLibrary = useYoutubePreferences((state) => state.syncLibrary);
  const setSyncLibrary = useYoutubePreferences((state) => state.setSyncLibrary);

  return (
    <div className="flex flex-col gap-[28px]">
      {!searchQuery?.trim() && (
        <div className="lane-setting-status flex items-center gap-[16px] rounded-[16px] bg-white/[0.09] px-[14px] py-[14px]">
          <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-[14px] bg-white/[0.08] text-text-secondary">
            <YoutubeFill size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-[600] text-text-primary">
              {signedIn ? (account?.name || account?.handle || "YouTube") : (t("settings.youtube.signed_out_title") || "Not signed in")}
            </div>
            <div className="mt-[3px] truncate text-[13px] text-text-secondary">
              {signedIn ? (account?.email || account?.handle || t("settings.youtube.signed_in") || "Connected") : (t("settings.youtube.signed_out_description") || "Sign in to keep YouTube playback working")}
            </div>
          </div>
          {signedIn ? (
            <button
              type="button"
              disabled={signingOut}
              onClick={() => {
                setSigningOut(true);
                void signOutYoutube().finally(() => setSigningOut(false));
              }}
              className="h-[42px] shrink-0 rounded-[12px] border-0 bg-text-primary px-[20px] text-[14px] font-[500] text-bg-primary disabled:opacity-60"
            >
              {t("settings.youtube.sign_out") || "Sign out"}
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() => showSignIn("manual")}
              className="h-[42px] shrink-0 rounded-[12px] border-0 bg-text-primary px-[20px] text-[14px] font-[500] text-bg-primary disabled:opacity-60"
            >
              {t("settings.youtube.sign_in") || "Sign in"}
            </button>
          )}
        </div>
      )}

      <SettingSection label={t("settings.youtube.section_playback") || "Playback"}>
        <SettingRow
          title={t("settings.youtube.account_playback.title") || "Play through your account"}
          description={t("settings.youtube.account_playback.description") || "Request YouTube audio with your signed-in account so streams are not blocked."}
          titleKey="settings.youtube.account_playback.title"
          descKey="settings.youtube.account_playback.description"
          searchQuery={searchQuery}
          icon={<PlayCircleLine size={20} />}
          control={<ToggleSwitch checked={accountPlayback} onChange={setAccountPlayback} />}
        />
        <SettingRow
          title={t("settings.youtube.prompt_sign_in.title") || "Ask to sign in"}
          description={t("settings.youtube.prompt_sign_in.description") || "Show the sign-in card when YouTube blocks playback instead of skipping the track."}
          titleKey="settings.youtube.prompt_sign_in.title"
          descKey="settings.youtube.prompt_sign_in.description"
          searchQuery={searchQuery}
          icon={<UserQuestionLine size={20} />}
          control={<ToggleSwitch checked={promptSignIn} onChange={setPromptSignIn} />}
        />
        <SettingRow
          title={t("settings.youtube.sync_library.title") || "Sync library"}
          description={t("settings.youtube.sync_library.description") || "Show playlists from your YouTube account in the library next to Lane playlists."}
          titleKey="settings.youtube.sync_library.title"
          descKey="settings.youtube.sync_library.description"
          searchQuery={searchQuery}
          icon={<Playlist2Line size={20} />}
          control={<ToggleSwitch checked={syncLibrary} onChange={setSyncLibrary} />}
        />
      </SettingSection>
    </div>
  );
}
