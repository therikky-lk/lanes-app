package com.therikky.lane.audio;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.ResolvingDataSource;
import androidx.media3.datasource.cronet.CronetDataSource;
import com.therikky.lane.net.Net;
import org.chromium.net.CronetEngine;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * One ExoPlayer for the whole app process. The Capacitor plugin drives it; the
 * media session service exposes it to the notification, lock screen and headsets.
 * Must be used on the main thread.
 */
@OptIn(markerClass = UnstableApi.class)
public final class PlayerHolder {

    public interface Events {
        void onState(boolean playing, boolean playWhenReady, boolean buffering, boolean ended, boolean seekable,
                     long positionMs, long durationMs, String error);

        void onRemote(String action, long positionMs);

        /** the player moved on to the queued next track by itself */
        void onAdvanced(String trackId);
    }

    /** the track to play after the current one, handed over ahead of time */
    private static final class NextSpec {
        final String afterTrackId;
        final String trackId;
        final String url;
        final Map<String, String> headers;
        final String title, artist, album, artwork;

        NextSpec(String afterTrackId, String trackId, String url, Map<String, String> headers,
                 String title, String artist, String album, String artwork) {
            this.afterTrackId = afterTrackId;
            this.trackId = trackId;
            this.url = url;
            this.headers = headers;
            this.title = title;
            this.artist = artist;
            this.album = album;
            this.artwork = artwork;
        }
    }

    private NextSpec pendingNext;

    private static PlayerHolder instance;

    private final Context context;
    private final ExoPlayer player;
    private final Player sessionPlayer;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Events events;
    private String lastError;
    private final ExecutorService artworkLoader = Executors.newSingleThreadExecutor();
    private int loadGeneration;
    private boolean liked;
    private Runnable likedListener;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            emit();
            if (player.isPlaying()) main.postDelayed(this, 250);
        }
    };

    public static synchronized PlayerHolder get(Context context) {
        if (instance == null) instance = new PlayerHolder(context.getApplicationContext());
        return instance;
    }

    private PlayerHolder(Context context) {
        this.context = context;
        player = new ExoPlayer.Builder(context)
            .setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus= */ true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build();

        player.addListener(new Player.Listener() {
            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (isPlaying) releaseHandoff();
                main.removeCallbacks(ticker);
                if (isPlaying) main.post(ticker);
                else emit();
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                // between two tracks nothing holds the CPU awake: with the screen
                // off the page could not load the next track until the phone
                // woke up. Keep it awake while the page hands over.
                if (state == Player.STATE_ENDED) holdHandoff();
                emit();
            }

            @Override
            public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
                emit();
            }

            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                StringBuilder detail = new StringBuilder(error.getErrorCodeName());
                Throwable cause = error.getCause();
                if (cause instanceof androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException) {
                    androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException http =
                        (androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException) cause;
                    detail.append(" HTTP ").append(http.responseCode);
                    if (http.dataSpec != null) {
                        detail.append(" at byte ").append(http.dataSpec.position)
                            .append(http.dataSpec.uri.getQueryParameter("range") != null ? " (range " + http.dataSpec.uri.getQueryParameter("range") + ")" : "");
                    }
                } else if (cause != null) {
                    detail.append(" ").append(cause.getClass().getSimpleName()).append(": ").append(cause.getMessage());
                }
                lastError = detail.toString();
                emit();
            }

            @Override
            public void onPositionDiscontinuity(@NonNull Player.PositionInfo oldPosition, @NonNull Player.PositionInfo newPosition, int reason) {
                emit();
            }

            @Override
            public void onMediaItemTransition(MediaItem mediaItem, int reason) {
                // the queued next track started on its own (end of the previous one,
                // or "next" on the notification): no page needed for that, so it
                // keeps going with the screen off or the app in the background
                if (mediaItem == null) return;
                if (reason != Player.MEDIA_ITEM_TRANSITION_REASON_AUTO
                    && reason != Player.MEDIA_ITEM_TRANSITION_REASON_SEEK) return;
                String id = mediaItem.mediaId;
                lastError = null;
                pendingNext = null;
                main.post(() -> {
                    int index = player.getCurrentMediaItemIndex();
                    if (index > 0) player.removeMediaItems(0, index);
                    if (events != null) events.onAdvanced(id);
                    emit();
                });
            }
        });

        // what the notification and the lock screen talk to: next / previous are
        // always offered and handed to the app, which owns the queue
        sessionPlayer = new ForwardingPlayer(player) {
            @NonNull
            @Override
            public Player.Commands getAvailableCommands() {
                return super.getAvailableCommands().buildUpon()
                    .add(Player.COMMAND_SEEK_TO_NEXT)
                    .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                    .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                    .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                    .build();
            }

            @Override
            public boolean isCommandAvailable(int command) {
                return getAvailableCommands().contains(command);
            }

            @Override
            public void seekToNext() {
                if (player.hasNextMediaItem()) player.seekToNextMediaItem();
                else remote("next");
            }

            @Override
            public void seekToNextMediaItem() {
                if (player.hasNextMediaItem()) player.seekToNextMediaItem();
                else remote("next");
            }

            @Override
            public void seekToPrevious() {
                remote("previous");
            }

            @Override
            public void seekToPreviousMediaItem() {
                remote("previous");
            }
        };
    }

    private android.os.PowerManager.WakeLock handoffLock;

    private void holdHandoff() {
        try {
            if (handoffLock == null) {
                android.os.PowerManager pm = (android.os.PowerManager) context.getSystemService(Context.POWER_SERVICE);
                handoffLock = pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "lane:handoff");
                handoffLock.setReferenceCounted(false);
            }
            handoffLock.acquire(45_000);
        } catch (Exception ignored) {
        }
    }

    private void releaseHandoff() {
        try {
            if (handoffLock != null && handoffLock.isHeld()) handoffLock.release();
        } catch (Exception ignored) {
        }
    }

    public Player sessionPlayer() {
        return sessionPlayer;
    }

    public ExoPlayer player() {
        return player;
    }

    public void setEvents(Events events) {
        this.events = events;
    }

    public boolean isLiked() {
        return liked;
    }

    /** the like button of the notification reflects this */
    public void setLiked(boolean liked) {
        if (this.liked == liked) return;
        this.liked = liked;
        if (likedListener != null) likedListener.run();
    }

    void setLikedListener(Runnable listener) {
        likedListener = listener;
    }

    void remote(String action) {
        if (events != null) events.onRemote(action, player.getCurrentPosition());
    }

    void emit() {
        if (events == null) return;
        long duration = player.getDuration();
        int state = player.getPlaybackState();
        events.onState(
            player.isPlaying(),
            player.getPlayWhenReady(),
            state == Player.STATE_BUFFERING,
            state == Player.STATE_ENDED,
            player.isCurrentMediaItemSeekable(),
            Math.max(0, player.getCurrentPosition()),
            duration == C.TIME_UNSET ? -1 : duration,
            lastError);
    }

    private MediaMetadata.Builder metadata(String title, String artist, String album, String artwork) {
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .setAlbumTitle(album)
            .setIsPlayable(true);
        if (artwork != null && artwork.startsWith("data:")) {
            try {
                String b64 = artwork.substring(artwork.indexOf(',') + 1);
                meta.setArtworkData(Base64.decode(b64, Base64.DEFAULT), MediaMetadata.PICTURE_TYPE_FRONT_COVER);
            } catch (IllegalArgumentException ignored) {
            }
        }
        return meta;
    }

    private MediaSource buildSource(String trackId, String url, Map<String, String> headers, MediaMetadata meta) {
        MediaItem item = new MediaItem.Builder()
            .setMediaId(trackId == null ? "" : trackId)
            .setUri(Uri.parse(url))
            .setMediaMetadata(meta)
            .build();

        Map<String, String> requestHeaders = new HashMap<>(headers);
        String userAgent = requestHeaders.remove("User-Agent");
        androidx.media3.datasource.DataSource.Factory http;
        CronetEngine cronet = Net.engine();
        if (cronet != null) {
            // Chromium stack: same TLS as Chrome, gets through where Java HTTPS doesn't
            CronetDataSource.Factory factory = new CronetDataSource.Factory(cronet, Net.executor())
                .setDefaultRequestProperties(requestHeaders)
                .setConnectionTimeoutMs(20_000)
                .setReadTimeoutMs(30_000);
            if (userAgent != null) factory.setUserAgent(userAgent);
            http = factory;
        } else {
            DefaultHttpDataSource.Factory factory = new DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setDefaultRequestProperties(requestHeaders);
            if (userAgent != null) factory.setUserAgent(userAgent);
            http = factory;
        }
        // googlevideo refuses (or ignores) Range headers for many clients, which
        // made every seek fail: ask for byte ranges with the `range` URL
        // parameter instead, like YouTube's own players do
        androidx.media3.datasource.DataSource.Factory upstream = http;
        if (url.contains(".googlevideo.com/")) {
            upstream = new ResolvingDataSource.Factory(http, PlayerHolder::withRangeParam);
        }
        return new ProgressiveMediaSource.Factory(new DefaultDataSource.Factory(context, upstream))
            .createMediaSource(item);
    }

    /** load a stream (http/https/file) with the request headers its client needs */
    public void load(String trackId, String url, Map<String, String> headers, String title, String artist, String album,
                     String artwork, long startPositionMs, boolean playWhenReady) {
        lastError = null;
        holdHandoff();
        final int generation = ++loadGeneration;
        MediaSource source = buildSource(trackId, url, headers, metadata(title, artist, album, artwork).build());

        player.setMediaSource(source, Math.max(0, startPositionMs));
        player.prepare();
        player.setPlayWhenReady(playWhenReady);
        // the next track may have been handed over before this one was loaded
        NextSpec next = pendingNext;
        if (next != null && trackId != null && trackId.equals(next.afterTrackId)) appendNext(next);
        emit();
        if (artwork != null && artwork.startsWith("http")) loadArtwork(artwork, generation, trackId);
    }

    /** what to play after `afterTrackId`; the player switches to it on its own */
    public void queueNext(String afterTrackId, String trackId, String url, Map<String, String> headers,
                          String title, String artist, String album, String artwork) {
        NextSpec next = new NextSpec(afterTrackId, trackId, url, headers, title, artist, album, artwork);
        pendingNext = next;
        MediaItem current = player.getCurrentMediaItem();
        if (current != null && afterTrackId != null && afterTrackId.equals(current.mediaId)) appendNext(next);
    }

    public void clearNext() {
        pendingNext = null;
        int index = player.getCurrentMediaItemIndex();
        int count = player.getMediaItemCount();
        if (count > index + 1) player.removeMediaItems(index + 1, count);
    }

    private void appendNext(NextSpec next) {
        int index = player.getCurrentMediaItemIndex();
        int count = player.getMediaItemCount();
        if (count > index + 1) player.removeMediaItems(index + 1, count);
        player.addMediaSource(buildSource(next.trackId, next.url, next.headers,
            metadata(next.title, next.artist, next.album, next.artwork).build()));
        if (next.artwork != null && next.artwork.startsWith("http")) loadArtwork(next.artwork, loadGeneration, next.trackId);
    }

    private void loadArtwork(String url, int generation, String trackId) {
        artworkLoader.execute(() -> {
            byte[] png = null;
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(10_000);
                conn.setReadTimeout(10_000);
                conn.setInstanceFollowRedirects(true);
                if (conn.getResponseCode() / 100 == 2) {
                    try (InputStream in = conn.getInputStream()) {
                        Bitmap bitmap = BitmapFactory.decodeStream(in);
                        if (bitmap != null) {
                            int max = Math.max(bitmap.getWidth(), bitmap.getHeight());
                            if (max > 512) {
                                float k = 512f / max;
                                bitmap = Bitmap.createScaledBitmap(bitmap,
                                    Math.round(bitmap.getWidth() * k), Math.round(bitmap.getHeight() * k), true);
                            }
                            ByteArrayOutputStream out = new ByteArrayOutputStream();
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out);
                            png = out.toByteArray();
                        }
                    }
                }
                conn.disconnect();
            } catch (Exception ignored) {
            }
            if (png == null) return;
            final byte[] data = png;
            main.post(() -> {
                if (generation != loadGeneration || player.getMediaItemCount() == 0) return;
                // the item may be the current one or the queued next one
                for (int i = 0; i < player.getMediaItemCount(); i++) {
                    MediaItem item = player.getMediaItemAt(i);
                    if (trackId != null && !trackId.equals(item.mediaId)) continue;
                    MediaMetadata updated = item.mediaMetadata.buildUpon()
                        .setArtworkData(data, MediaMetadata.PICTURE_TYPE_FRONT_COVER)
                        .build();
                    player.replaceMediaItem(i, item.buildUpon().setMediaMetadata(updated).build());
                    return;
                }
            });
        });
    }

    private static DataSpec withRangeParam(DataSpec spec) {
        Uri uri = spec.uri;
        if (uri.getHost() == null || !uri.getHost().endsWith(".googlevideo.com")) return spec;
        if (spec.position == 0 && spec.length == C.LENGTH_UNSET) return spec;
        long start = spec.position;
        long end = -1;
        if (spec.length != C.LENGTH_UNSET) {
            end = start + spec.length - 1;
        } else {
            String clen = uri.getQueryParameter("clen");
            if (clen != null) {
                try {
                    end = Long.parseLong(clen) - 1;
                } catch (NumberFormatException ignored) {
                }
            }
        }
        Uri.Builder builder = uri.buildUpon().clearQuery();
        for (String name : uri.getQueryParameterNames()) {
            if ("range".equals(name)) continue;
            for (String value : uri.getQueryParameters(name)) builder.appendQueryParameter(name, value);
        }
        builder.appendQueryParameter("range", start + "-" + (end >= start ? String.valueOf(end) : ""));
        // the server now answers from `start`: read it as a fresh stream
        return spec.buildUpon().setUri(builder.build()).setPosition(0).setLength(C.LENGTH_UNSET).build();
    }

    private int repeatMode;
    private Runnable repeatListener;

    /** 0 off, 1 all, 2 one: shown on the notification's repeat button */
    public int getRepeatMode() {
        return repeatMode;
    }

    public void setRepeatMode(int mode) {
        if (repeatMode == mode) return;
        repeatMode = mode;
        if (repeatListener != null) repeatListener.run();
    }

    void setRepeatListener(Runnable listener) {
        repeatListener = listener;
    }

    public void setRate(float rate) {
        player.setPlaybackParameters(new PlaybackParameters(rate));
    }
}
