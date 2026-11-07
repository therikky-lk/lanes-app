import { useCallback, useEffect, useSyncExternalStore } from "react";
import { artistAvatarKey, loadArtistAvatar, peekArtistAvatar, subscribeArtistAvatar } from "./artistAvatarCache";
export function useArtistAvatar(id?: string, name?: string, sourceUrl?: string) {
  const key = artistAvatarKey(id, name);
  const subscribe = useCallback((listener: () => void) => subscribeArtistAvatar(key, listener), [key]);
  const avatar = useSyncExternalStore(subscribe, () => peekArtistAvatar(key), () => null);
  useEffect(() => {
    if (!id && !name) return;
    void loadArtistAvatar(id, name, sourceUrl).catch(() => {});
  }, [id, name, key, sourceUrl]);
  return avatar;
}
