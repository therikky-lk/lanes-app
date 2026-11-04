import { useEffect, useState } from "react";
import { resolveArtistAvatar } from "./artistAvatar";
const cache = new Map<string, { url: string | null; expires: number }>();
const requests = new Map<string, Promise<string | null>>();
export function useArtistAvatar(id?: string, name?: string) {
  const key = `${id ?? ""}:${name ?? ""}`;
  const [avatar, setAvatar] = useState<{ key: string; url: string | null }>({ key, url: cache.get(key)?.url ?? null });
  useEffect(() => {
    if (!id && !name) return;
    let active = true;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) { setAvatar({ key, url: cached.url }); return; }
    let request = requests.get(key);
    if (!request) {
      request = resolveArtistAvatar(id, name).then(url => {
        cache.set(key, { url, expires: Date.now() + (url ? 60 * 60_000 : 30_000) });
        if (cache.size > 256) cache.delete(cache.keys().next().value!);
        return url;
      }).finally(() => requests.delete(key));
      requests.set(key, request);
    }
    void request.then(url => { if (active) setAvatar({ key, url }); });
    return () => { active = false; };
  }, [id, name, key]);
  return avatar.key === key ? avatar.url : null;
}
