import { isLocalTrackId, setLocalTrackLiked } from "@/shared/media/local/localTracks";
import { useCallback, useState } from "react";
import { api } from "@/shared/api";
import {
  notifyLibraryChanged,
  evictPlaylistFromCache,
  addLocalTrackToPlaylist,
  removeLocalTrackFromPlaylist,
} from "./usePlaylists";
import { isLocalPlaylistItemId, LOCAL_ITEM_PREFIX } from "@/features/local/localPlaylistTracks";
import { applyOptimisticLike, applyOptimisticUnlike } from "./useLikedTracks";

type Options = {
  onSuccess?: (...args: any[]) => void;
  onError?: (error: unknown) => void;
  onSettled?: () => void;
};

function useMutation<T, R = unknown>(action: (input: T) => Promise<R>) {
  const [isPending, setIsPending] = useState(false);
  const mutateAsync = useCallback(
    async (input: T): Promise<R> => {
      setIsPending(true);
      try {
        const result = await action(input);
        notifyLibraryChanged();
        return result;
      } finally {
        setIsPending(false);
      }
    },
    [action]
  );
  const mutate = useCallback(
    (input: T, options?: Options) => {
      void mutateAsync(input)
        .then((value) => options?.onSuccess?.(value))
        .catch((error) => options?.onError?.(error))
        .finally(() => options?.onSettled?.());
    },
    [mutateAsync]
  );
  return { mutate, mutateAsync, isPending };
}

export function useAddPlaylistTracks() {
  return useMutation(({ playlistId, trackId }: { playlistId: string; trackId: string }) =>
    isLocalTrackId(trackId)
      ? addLocalTrackToPlaylist(playlistId, trackId).then(() => undefined)
      : api.addPlaylistTrack(playlistId, trackId).then(() => undefined)
  );
}

export function useRemovePlaylistTracks() {
  return useMutation(({ playlistId, itemId }: { playlistId: string; itemId: string }) =>
    isLocalPlaylistItemId(itemId)
      ? removeLocalTrackFromPlaylist(playlistId, itemId.slice(LOCAL_ITEM_PREFIX.length))
      : api.removePlaylistItem(playlistId, itemId)
  );
}

export function useReorderPlaylistTracks() {
  return useMutation(
    ({
      playlistId,
      itemId,
      beforeItemId,
      revision,
    }: {
      playlistId: string;
      itemId: string;
      beforeItemId: string | null;
      revision: number;
    }) => api.movePlaylistItem(playlistId, itemId, beforeItemId, revision)
  );
}

export function useCreatePlaylist() {
  return useMutation(({ title, description }: { title: string; description?: string }) =>
    api.createPlaylist({ title, description })
  );
}

export function useDeletePlaylist() {
  return useMutation(async ({ playlistId }: { playlistId: string }) => {
    evictPlaylistFromCache(playlistId);
    return api.deletePlaylist(playlistId);
  });
}

export function useSaveExternalItem() {
  return useMutation(
    ({
      type,
      id,
      snapshot,
    }: {
      type: "album" | "artist" | "playlist";
      id: string;
      snapshot?: Record<string, unknown>;
    }) => api.saveCollection(`${type}s` as "albums" | "artists" | "playlists", id, snapshot),
  );
}

export function useRemoveExternalItem() {
  return useMutation(
    async ({
      type,
      id,
      isOwned,
    }: {
      type: "album" | "artist" | "playlist";
      id: string;
      isOwned?: boolean;
    }) => {
      if (type === "playlist") {
        evictPlaylistFromCache(id);
        if (isOwned === false) {
          return api.removeCollection("playlists", id);
        }
        try {
          const res = await api.deletePlaylist(id);
          // purge any saved collection reference in case it was both created and saved
          await api.removeCollection("playlists", id).catch(() => {});
          return res;
        } catch (err: unknown) {
          // the reply can get lost even when the playlist is gone (phones):
          // only a playlist that is still there is a failure
          const still = await api
            .listPlaylists()
            .then((r) => r.items.some((p) => p.id === id))
            .catch(() => true);
          if (!still) return;
          if (isOwned === true) {
            throw err;
          }
          // fall back to removing from saved collections if playlist was not owned
          return api.removeCollection("playlists", id);
        }
      }
      return api.removeCollection(`${type}s` as "albums" | "artists", id);
    },
  );
}

type TrackMutationInput = string | { trackId: string; [key: string]: unknown };
const trackIdFrom = (input: TrackMutationInput) =>
  typeof input === "string" ? input : input.trackId;

export function useLikeTrack() {
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = useCallback(async (input: TrackMutationInput) => {
    const trackId = trackIdFrom(input);
    setIsPending(true);
    if (isLocalTrackId(trackId)) {
      await setLocalTrackLiked(trackId, true).finally(() => setIsPending(false));
      return undefined as unknown as Awaited<ReturnType<typeof api.likeTrack>>;
    }
    const rollback = applyOptimisticLike(trackId);
    try {
      const result = await api.likeTrack(trackId);
      notifyLibraryChanged();
      return result;
    } catch (err) {
      rollback();
      throw err;
    } finally {
      setIsPending(false);
    }
  }, []);

  const mutate = useCallback(
    (input: TrackMutationInput, options?: Options) => {
      void mutateAsync(input)
        .then((value) => options?.onSuccess?.(value))
        .catch((error) => options?.onError?.(error))
        .finally(() => options?.onSettled?.());
    },
    [mutateAsync]
  );

  return { mutate, mutateAsync, isPending };
}

async function isStillLiked(trackId: string): Promise<boolean> {
  try {
    let cursor: string | undefined;
    do {
      const page = await api.listLikedTracks(100, cursor);
      if (page.items.some(({ track }) => track.id === trackId)) return true;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return false;
  } catch {
    return true;
  }
}

export function useUnlikeTrack() {
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = useCallback(async (input: TrackMutationInput) => {
    const trackId = trackIdFrom(input);
    setIsPending(true);
    if (isLocalTrackId(trackId)) {
      await setLocalTrackLiked(trackId, false).finally(() => setIsPending(false));
      return undefined as unknown as Awaited<ReturnType<typeof api.unlikeTrack>>;
    }
    const rollback = applyOptimisticUnlike(trackId);
    try {
      const result = await api.unlikeTrack(trackId);
      notifyLibraryChanged();
      return result;
    } catch (err) {
      // the reply can get lost even though the like is gone (phones): only
      // put the heart back when the server still has the like
      if (!(await isStillLiked(trackId))) {
        notifyLibraryChanged();
        return undefined as unknown as Awaited<ReturnType<typeof api.unlikeTrack>>;
      }
      rollback();
      throw err;
    } finally {
      setIsPending(false);
    }
  }, []);

  const mutate = useCallback(
    (input: TrackMutationInput, options?: Options) => {
      void mutateAsync(input)
        .then((value) => options?.onSuccess?.(value))
        .catch((error) => options?.onError?.(error))
        .finally(() => options?.onSettled?.());
    },
    [mutateAsync]
  );

  return { mutate, mutateAsync, isPending };
}
