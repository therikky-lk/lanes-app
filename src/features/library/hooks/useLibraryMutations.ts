import { usePlayerStore } from "@/features/player/store/playerStore";
import type { Track } from "@/shared/types";
import type { Track as ApiTrackBase } from "@/shared/contracts";
import { isLocalTrackId } from "@/shared/media/local/localTracks";
import { setLocalLike } from "@/features/local/localLikesSync";
import { useCallback, useState } from "react";
import { api, toTrackSnapshot } from "@/shared/api";
import {
  notifyLibraryChanged,
  applyPlaylistItemRemoval,
  addLocalTrackToPlaylist,
  removeLocalTrackFromPlaylist,
} from "./usePlaylists";
import { removeLibraryPlaylist } from "../services/removeLibraryPlaylist";
import { isLocalPlaylistItemId, LOCAL_ITEM_PREFIX } from "@/features/local/localPlaylistTracks";
import { applyOptimisticLike, applyOptimisticUnlike, loadLikedTracks } from "./useLikedTracks";

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
  return useMutation(({ playlistId, trackId, trackSnapshot }: { playlistId: string; trackId: string; trackSnapshot?: ApiTrackBase }) =>
    isLocalTrackId(trackId)
      ? addLocalTrackToPlaylist(playlistId, trackId).then(() => undefined)
      : api.addPlaylistTrack(playlistId, trackId, trackSnapshot).then(() => undefined)
  );
}

async function removePlaylistTrack({ playlistId, itemId }: { playlistId: string; itemId: string }) {
  if (isLocalPlaylistItemId(itemId)) {
    await removeLocalTrackFromPlaylist(playlistId, itemId.slice(LOCAL_ITEM_PREFIX.length));
  } else {
    await api.removePlaylistItem(playlistId, itemId);
  }
  applyPlaylistItemRemoval(playlistId, itemId);
}

export function useRemovePlaylistTracks() {
  return useMutation(removePlaylistTrack);
}

export function useRemovePlaylistSelection() {
  return useMutation(async ({ playlistId, itemIds }: { playlistId: string; itemIds: string[] }) => {
    let failed = 0;
    for (const itemId of new Set(itemIds)) {
      try { await removePlaylistTrack({ playlistId, itemId }); }
      catch { failed++; }
    }
    return failed;
  });
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
  return useMutation(({ playlistId }: { playlistId: string }) => removeLibraryPlaylist(playlistId, true));
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
        return removeLibraryPlaylist(id, isOwned);
      }
      return api.removeCollection(`${type}s` as "albums" | "artists", id);
    },
  );
}

type TrackMutationInput = string | { trackId: string; [key: string]: unknown };
const trackIdFrom = (input: TrackMutationInput) =>
  typeof input === "string" ? input : input.trackId;

/** the track's details, from the caller or from what the player knows */
function knownTrack(input: TrackMutationInput): Track | undefined {
  if (typeof input !== "string" && input.track && typeof input.track === "object") return input.track as Track;
  const id = trackIdFrom(input);
  const { currentTrack, queue } = usePlayerStore.getState();
  if (currentTrack?.id === id) return currentTrack;
  return queue.find((t) => t.id === id);
}

export function useLikeTrack() {
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = useCallback(async (input: TrackMutationInput) => {
    const trackId = trackIdFrom(input);
    setIsPending(true);
    if (isLocalTrackId(trackId)) {
      await setLocalLike(trackId, true).finally(() => setIsPending(false));
      return undefined as unknown as Awaited<ReturnType<typeof api.likeTrack>>;
    }
    const track = knownTrack(input);
    const snapshot = track?.title?.trim() ? toTrackSnapshot({ ...track, id: trackId }) : undefined;
    const rollback = applyOptimisticLike(trackId, track);
    try {
      const result = await api.likeTrack(trackId, snapshot);
      if (!snapshot) void loadLikedTracks(true);
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
      await setLocalLike(trackId, false).finally(() => setIsPending(false));
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
