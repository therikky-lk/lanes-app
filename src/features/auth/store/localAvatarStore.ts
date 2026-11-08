import { create } from "zustand";

const KEY = "lane_local_avatars";
type Avatars = Record<string, string | null>;
function read(): Avatars {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, avatar]) => avatar === null || (typeof avatar === "string" && avatar.startsWith("data:image/") && avatar.length < 400_000))) as Avatars;
  } catch { return {}; }
}

export const useLocalAvatarStore = create<{ avatars: Avatars; setAvatar: (userId: string, avatar: string | null) => void; removeAvatar: (userId: string) => void }>((set, get) => ({
  avatars: read(),
  setAvatar: (userId, avatar) => {
    const avatars = { ...get().avatars, [userId]: avatar };
    // Commit only after storage succeeds, so a full device is reported to the user.
    localStorage.setItem(KEY, JSON.stringify(avatars));
    set({ avatars });
  },
  removeAvatar: (userId) => {
    const avatars = { ...get().avatars };
    delete avatars[userId];
    localStorage.setItem(KEY, JSON.stringify(avatars));
    set({ avatars });
  },
}));

export function useLocalAvatar(userId?: string, remoteUrl?: string | null): string | null {
  return useLocalAvatarStore(state => remoteUrl || (userId && Object.hasOwn(state.avatars, userId) ? state.avatars[userId] : null));
}
