import { fetchSpotifyAccountAlbum, fetchSpotifyLikedTracks, fetchSpotifyOAuthPlaylist, SpotifyRequestError, spotifyAccountSupported, spotifyHasLogin, spotifyUserToken, spotifyUsesOAuth } from "./spotifyAccount";
import type { ClientImportedPlaylist, ClientImportedTrack } from "../../importTypes";
import { rethrowIfAborted } from "@/shared/utils/abort";
import { log } from "@/shared/utils/logger";
import { fetchSpotifyEmbed } from "./spotifyEmbed";
import { fetchSpotifyPlaylistTracks, type PathfinderResult } from "./spotifyPathfinder";
import { rememberSourceMeta } from "../../importedPlaylistMeta";
import { parseSpotifyUrl, resolveSpotifyUrl, type SpotifyEntityType } from "./spotifyUrl";

function defaultTitle(entityType: SpotifyEntityType): string {
  if (entityType === "album") return "Imported Spotify album";
  if (entityType === "track") return "Imported Spotify track";
  return "Imported Spotify playlist";
}

const EMBED_TRACK_CAP = 100;

async function tryPathfinder(entityId: string, signal?: AbortSignal): Promise<PathfinderResult> {
  try {
    return await fetchSpotifyPlaylistTracks(entityId, signal);
  } catch (error) {
    rethrowIfAborted(signal);
    log("yellow", "import", `spotify pathfinder failed, falling back to the embed page: ${String(error)}`);
    return { tracks: [], total: undefined };
  }
}

function pickPlaylistTracks(full: PathfinderResult, embed: ClientImportedTrack[]): ClientImportedTrack[] {
  if (full.tracks.length > 0 && full.tracks.length >= embed.length) {
    if (full.total !== undefined && full.tracks.length < full.total) {
      log("yellow", "import", `spotify import is partial: ${full.tracks.length} of ${full.total} tracks`);
    }
    return full.tracks;
  }
  if (embed.length >= EMBED_TRACK_CAP) {
    log("yellow", "import", `spotify embed lists only the first ${EMBED_TRACK_CAP} tracks of this playlist`);
  }
  return embed;
}

export async function importSpotify(rawUrl: string, signal?: AbortSignal): Promise<ClientImportedPlaylist> {
  if (rawUrl.replace(/\/+$/, "").endsWith("/collection/tracks")) {
    // the signed-in user's Liked Songs (see spotifyAccount.ts)
    const tracks = await fetchSpotifyLikedTracks(signal);
    if (!tracks.length) throw new Error("Your Spotify Liked Songs are empty.");
    return { source: "spotify", sourceUrl: rawUrl, title: "Spotify — Liked Songs", tracks };
  }
  const resolvedUrl = await resolveSpotifyUrl(rawUrl, signal);
  const { type: entityType, id: entityId } = parseSpotifyUrl(resolvedUrl);
  const accountSupported = entityType !== "track" && spotifyAccountSupported();
  const signedIn = accountSupported ? await spotifyHasLogin().catch(() => null) : false;
  if (signedIn && entityType === "album") {
    const album = await fetchSpotifyAccountAlbum(entityId, signal).catch(() => {
      rethrowIfAborted(signal);
      return null;
    });
    if (album?.tracks.length) {
      rememberSourceMeta(rawUrl, { coverUrl: album.coverUrl });
      return { source: "spotify", sourceUrl: rawUrl, title: album.title ?? defaultTitle(entityType), tracks: album.tracks };
    }
  }
  // personal playlists have no public embed: carry on without it
  const embed = await fetchSpotifyEmbed(entityType, entityId, defaultTitle(entityType), signal).catch((error) => {
    rethrowIfAborted(signal);
    if (entityType !== "playlist") throw error;
    log("yellow", "import", `spotify embed failed: ${String(error)}`);
    return { title: undefined, description: undefined, coverUrl: undefined, tracks: [] as ClientImportedTrack[] };
  });
  const title = embed.title ?? defaultTitle(entityType);
  const remember = (tracks: ClientImportedTrack[]) => {
    rememberSourceMeta(rawUrl, {
      coverUrl: embed.coverUrl ?? tracks.find(track => track.coverUrl)?.coverUrl,
      owner: embed.description,
    });
  };
  const base = {
    source: "spotify" as const,
    sourceUrl: rawUrl,
    title,
    ...(embed.description ? { description: embed.description } : {}),
  };

  if (entityType === "playlist") {
    const oauth = spotifyUsesOAuth();
    let accountError: unknown;
    if (oauth && signedIn) {
      try {
        const tracks = await fetchSpotifyOAuthPlaylist(entityId, signal);
        if (tracks.length > 0 && tracks.length >= embed.tracks.length) { remember(tracks); return { ...base, tracks }; }
      } catch (error) {
        rethrowIfAborted(signal);
        accountError = error;
      }
    }
    const full = await tryPathfinder(entityId, signal);
    const tracks = pickPlaylistTracks(full, embed.tracks);
    if (!oauth && signedIn && (!tracks.length || (embed.tracks.length >= EMBED_TRACK_CAP && tracks.length === embed.tracks.length)
      || (full.total !== undefined && tracks.length < full.total))) {
      const mine = await fetchSpotifyPlaylistTracks(entityId, signal, () => spotifyUserToken(signal)).catch((error) => {
        rethrowIfAborted(signal);
        log("yellow", "import", `spotify playlist as the signed-in user failed: ${String(error)}`);
        return { tracks: [] as ClientImportedTrack[], total: undefined };
      });
      if (mine.tracks.length > 0 && mine.tracks.length >= tracks.length) { remember(mine.tracks); return { ...base, tracks: mine.tracks }; }
    }
    if (tracks.length > 0) { remember(tracks); return { ...base, tracks }; }
    if (accountError instanceof SpotifyRequestError && (accountError.status === 403 || accountError.status === 404)) {
      throw new Error("Spotify didn’t share this playlist. For Wrapped, copy its tracks into a new playlist you own and import that link.");
    }
    if (accountError instanceof SpotifyRequestError && accountError.status === 401) {
      throw new Error("Spotify rejected the session. Reconnect your account in Settings → Spotify.");
    }
    if (accountError) throw accountError;
    if (signedIn === null) throw new Error("Could not check your Spotify session. Try again.");
    if (!signedIn && accountSupported) {
      throw new Error(
        "This looks like a personal Spotify playlist. Sign in under Settings → Spotify, then try importing it again.",
      );
    }
  }
  if (embed.tracks.length > 0) { remember(embed.tracks); return { ...base, tracks: embed.tracks }; }
  throw new Error(`No tracks found in the Spotify ${entityType}.`);
}
