export {
  completeYoutubeTvSignIn,
  getYoutubeAuthTokens,
  getYoutubePageId,
  getYoutubeSessionKey,
  isYoutubeSignedIn,
  selectYoutubePageId,
  signOutYoutube,
  startYoutubeTvSignIn,
} from "./auth/youtubeAuthSession";
export type { TvDeviceCode } from "./auth/tvDeviceFlow";
export { YoutubeAuthError, type YoutubeAuthTokens } from "./auth/tvTokens";
export {
  fetchYoutubeAccount,
  fetchYoutubeAccounts,
  selectedYoutubeAccount,
  type YoutubeAccount,
} from "./auth/youtubeAccount";
export {
  prefersAccountPlayback,
  prefersSignInPrompt,
  useYoutubePreferences,
} from "./auth/youtubePreferences";
export {
  declineYoutubeSignIn,
  isBotCheckError,
  isYoutubeSignInDeclined,
  onYoutubeAuthChanged,
  onYoutubeSignInRequested,
  requestYoutubeSignIn,
} from "./auth/signInRequest";
export {
  isAccountPlaylistId,
  type YoutubeAccountPlaylist,
} from "./account/accountPlaylists";
export { fetchYoutubeAccountPlaylist } from "./account/accountPlaylistDetails";
export { fetchYoutubeAccountPlaylists } from "./account/accountPlaylists";
export { TV_ACCOUNT_PROFILE, PLAYBACK_PROFILES } from "@/shared/media/innertube/playbackProfiles";
export type { InnertubeProfile } from "@/shared/media/innertube/innertubeClient";

export function isAlbumPlaylistId(id: string): boolean {
  return id.startsWith("OLAK5uy_");
}
