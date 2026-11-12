package com.therikky.lane.audio;

import android.content.Context;
import android.util.Log;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
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
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.TransferListener;
import androidx.media3.datasource.ResolvingDataSource;
import androidx.media3.datasource.cronet.CronetDataSource;
import com.therikky.lane.net.Net;
import org.chromium.net.CronetEngine;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
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
        void onDiagnostic(String message);

        /** the player moved on to the queued next track by itself */
        void onAdvanced(String trackId);
    }

    /** a track to play after the current one, handed over ahead of time */
    public static final class NextSpec {
        final String trackId;
        final String url;
        final Map<String, String> headers;
        final String title, artist, album, artwork;

        public NextSpec(String trackId, String url, Map<String, String> headers,
                        String title, String artist, String album, String artwork) {
            this.trackId = trackId;
            this.url = url;
            this.headers = headers;
            this.title = title;
            this.artist = artist;
            this.album = album;
            this.artwork = artwork;
        }
    }

    /** the tracks after `pendingAfter`, waiting for that one to be loaded */
    private java.util.List<NextSpec> pendingQueue;
    private String pendingAfter;

    private static PlayerHolder instance;

    private final Context context;
    private final ExoPlayer player;
    private final Player sessionPlayer;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Events events;
    private String lastError;
    private final ExecutorService artworkLoader = Executors.newSingleThreadExecutor();
    private volatile int loadGeneration;
    private long playbackRequestedAt;
    private static final int ARTWORK_SIDE = 512;
    private boolean liked;
    private final LaneEqualizer equalizer = new LaneEqualizer();
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
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(context) {
            @Override
            protected AudioSink buildAudioSink(Context context, boolean enableFloatOutput,
                                               boolean enableAudioTrackPlaybackParams) {
                // The EQ processes 16-bit PCM. Let the sink convert decoder output when needed.
                return new DefaultAudioSink.Builder(context)
                    .setAudioProcessors(new AudioProcessor[] { equalizer })
                    .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                    .build();
            }
        };
        player = new ExoPlayer.Builder(context, renderers)
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
                if (isPlaying) {
                    releaseHandoff();
                    reportPlayerState("PLAYING");
                }
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
                reportPlayerState(state == Player.STATE_BUFFERING ? "BUFFERING"
                    : state == Player.STATE_READY ? "READY"
                    : state == Player.STATE_IDLE ? "IDLE" : "ENDED");
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
                // for the diagnostics log: where a seek (from anywhere) actually landed
                if (reason == Player.DISCONTINUITY_REASON_SEEK && events != null) {
                    events.onRemote("seeked", newPosition.positionMs);
                }
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
                playbackRequestedAt = SystemClock.elapsedRealtime();
                lastError = null;
                pendingQueue = null;
                pendingAfter = null;
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

    public void clearEvents(Events listener) {
        if (events == listener) events = null;
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

    String currentTrackId() {
        MediaItem item = player.getCurrentMediaItem();
        return item == null ? "" : item.mediaId;
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
        DefaultDataSource.Factory dataSource = new DefaultDataSource.Factory(context, upstream)
            .setTransferListener(firstBytesListener(item.mediaId));
        return new ProgressiveMediaSource.Factory(dataSource)
            .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy() {
                @Override public long getRetryDelayMsFor(LoadErrorHandlingPolicy.LoadErrorInfo error) {
                    long delay;
                    if (error.exception instanceof HttpDataSource.InvalidResponseCodeException
                            && ((HttpDataSource.InvalidResponseCodeException) error.exception).responseCode == 429) {
                        if (error.errorCount > 1) return C.TIME_UNSET;
                        HttpDataSource.InvalidResponseCodeException response =
                            (HttpDataSource.InvalidResponseCodeException) error.exception;
                        String retryAfter = null;
                        for (Map.Entry<String, java.util.List<String>> header : response.headerFields.entrySet()) {
                            if ("retry-after".equalsIgnoreCase(header.getKey()) && !header.getValue().isEmpty()) {
                                retryAfter = header.getValue().get(0);
                                break;
                            }
                        }
                        delay = Net.retryAfterMs(retryAfter, 30_000);
                    } else if (Net.isConnectionLoss(error.exception)) {
                        if (error.errorCount > 3) return C.TIME_UNSET;
                        delay = 250L << (error.errorCount - 1);
                    } else {
                        return super.getRetryDelayMsFor(error);
                    }
                    main.post(() -> diagnostic("media3 retry track=" + item.mediaId
                        + " attempt=" + error.errorCount + " delay=" + delay + "ms"));
                    return delay;
                }
            }).createMediaSource(item);
    }

    private void diagnostic(String message) {
        Log.i("LaneAudio", message);
        if (events != null) events.onDiagnostic(message);
    }

    private void reportPlayerState(String state) {
        long elapsed = playbackRequestedAt > 0 ? SystemClock.elapsedRealtime() - playbackRequestedAt : 0;
        diagnostic("media3 " + state + " track=" + currentTrackId() + " elapsed=" + elapsed
            + "ms position=" + player.getCurrentPosition() + "ms bufferedPosition="
            + player.getBufferedPosition() + "ms");
    }

    private TransferListener firstBytesListener(String trackId) {
        return new TransferListener() {
            private long started;
            private boolean reported;

            @Override public void onTransferInitializing(DataSource source, DataSpec spec, boolean network) {
                started = SystemClock.elapsedRealtime();
            }
            @Override public void onTransferStart(DataSource source, DataSpec spec, boolean network) {}
            @Override public void onTransferEnd(DataSource source, DataSpec spec, boolean network) {}
            @Override public void onBytesTransferred(DataSource source, DataSpec spec, boolean network, int bytes) {
                if (reported || bytes <= 0) return;
                reported = true;
                long elapsed = SystemClock.elapsedRealtime() - started;
                main.post(() -> diagnostic("media3 first bytes track=" + trackId + " transfer=" + elapsed
                    + "ms bytes=" + bytes + " network=" + network));
            }
        };
    }

    /** load a stream (http/https/file) with the request headers its client needs */
    public void load(String trackId, String url, Map<String, String> headers, String title, String artist, String album,
                     String artwork, long startPositionMs, boolean playWhenReady) {
        lastError = null;
        holdHandoff();
        final int generation = ++loadGeneration;
        playbackRequestedAt = SystemClock.elapsedRealtime();
        MediaSource source = buildSource(trackId, url, headers, metadata(title, artist, album, artwork).build());

        player.setMediaSource(source, Math.max(0, startPositionMs));
        player.prepare();
        player.setPlayWhenReady(playWhenReady);
        // the next tracks may have been handed over before this one was loaded
        if (pendingQueue != null && trackId != null && trackId.equals(pendingAfter)) appendQueue(pendingQueue);
        emit();
        if (artwork != null && artwork.startsWith("http")) loadArtwork(artwork, generation, trackId);
    }

    /**
     * What to play after `afterTrackId`, in order; the player moves through
     * these on its own, so playback keeps going while the app's page sleeps.
     */
    public void queueNext(String afterTrackId, java.util.List<NextSpec> queue) {
        pendingQueue = queue;
        pendingAfter = afterTrackId;
        MediaItem current = player.getCurrentMediaItem();
        if (current != null && afterTrackId != null && afterTrackId.equals(current.mediaId)) appendQueue(queue);
    }

    public void clearNext() {
        pendingQueue = null;
        pendingAfter = null;
        int index = player.getCurrentMediaItemIndex();
        int count = player.getMediaItemCount();
        if (count > index + 1) player.removeMediaItems(index + 1, count);
    }

    public void updateArtwork(String trackId, String artwork) {
        if (trackId == null || trackId.isEmpty() || artwork == null || !artwork.startsWith("http")) return;
        loadArtwork(artwork, loadGeneration, trackId);
    }

    private void appendQueue(java.util.List<NextSpec> queue) {
        int index = player.getCurrentMediaItemIndex();
        int count = player.getMediaItemCount();
        // keep what's already queued in the same order (its buffer too);
        // replace only from the first difference on
        int keep = 0;
        while (keep < queue.size() && index + 1 + keep < count
            && queue.get(keep).trackId.equals(player.getMediaItemAt(index + 1 + keep).mediaId)) {
            keep++;
        }
        int from = index + 1 + keep;
        if (count > from) player.removeMediaItems(from, count);
        for (int i = keep; i < queue.size(); i++) {
            NextSpec next = queue.get(i);
            player.addMediaSource(buildSource(next.trackId, next.url, next.headers,
                metadata(next.title, next.artist, next.album, next.artwork).build()));
            if (next.artwork != null && next.artwork.startsWith("http")) loadArtwork(next.artwork, loadGeneration, next.trackId);
        }
    }

    private static HttpURLConnection openArtwork(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(10_000);
        connection.setInstanceFollowRedirects(true);
        return connection;
    }

    private static Bitmap decodeArtwork(String url) throws IOException {
        HttpURLConnection connection = openArtwork(url);
        BitmapFactory.Options options = new BitmapFactory.Options();
        try {
            if (connection.getResponseCode() / 100 != 2) return null;
            try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream())) {
                input.mark(256 * 1024);
                options.inJustDecodeBounds = true;
                BitmapFactory.decodeStream(input, null, options);
                int side = Math.max(options.outWidth, options.outHeight);
                if (side <= 0) return null;
                options.inJustDecodeBounds = false;
                options.inSampleSize = 1;
                while (side / options.inSampleSize >= ARTWORK_SIDE * 2) options.inSampleSize *= 2;
                try {
                    input.reset();
                    return BitmapFactory.decodeStream(input, null, options);
                } catch (IOException largeHeader) {
                    // A large metadata header can exceed the mark buffer.
                    // Reopen that response instead of decoding at full size.
                }
            }
        } finally {
            connection.disconnect();
        }

        HttpURLConnection retry = openArtwork(url);
        try {
            if (retry.getResponseCode() / 100 != 2) return null;
            try (InputStream input = retry.getInputStream()) {
                return BitmapFactory.decodeStream(input, null, options);
            }
        } finally {
            retry.disconnect();
        }
    }

    private void loadArtwork(String url, int generation, String trackId) {
        artworkLoader.execute(() -> {
            if (generation != loadGeneration) return;
            final byte[] data;
            try {
                Bitmap decoded = decodeArtwork(url);
                if (decoded == null) return;
                Bitmap artwork = decoded;
                try {
                    if (generation != loadGeneration) return;
                    int side = Math.max(decoded.getWidth(), decoded.getHeight());
                    if (side > ARTWORK_SIDE) {
                        float scale = (float) ARTWORK_SIDE / side;
                        artwork = Bitmap.createScaledBitmap(decoded,
                            Math.max(1, Math.round(decoded.getWidth() * scale)),
                            Math.max(1, Math.round(decoded.getHeight() * scale)), true);
                    }
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    if (!artwork.compress(Bitmap.CompressFormat.JPEG, 90, out)) return;
                    data = out.toByteArray();
                } finally {
                    if (artwork != decoded) artwork.recycle();
                    decoded.recycle();
                }
            } catch (Exception ignored) {
                return;
            }
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
        int nextMode = Math.max(0, Math.min(2, mode));
        if (repeatMode == nextMode) return;
        repeatMode = nextMode;
        // The app owns repeat-all queue order. ExoPlayer handles repeat-one
        // so a single track can loop without waiting for the page to wake up.
        player.setRepeatMode(nextMode == 2 ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_OFF);
        if (repeatListener != null) repeatListener.run();
    }

    void setRepeatListener(Runnable listener) {
        repeatListener = listener;
    }

    public void setVolume(float volume) {
        player.setVolume(Math.max(0f, Math.min(1f, volume)));
    }

    public void setEqualizer(boolean enabled, float[] gains) {
        equalizer.setGains(enabled, gains);
    }

    public void setRate(float rate) {
        player.setPlaybackParameters(new PlaybackParameters(rate));
    }
}
