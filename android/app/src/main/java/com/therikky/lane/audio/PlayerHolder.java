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
    }

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
                main.removeCallbacks(ticker);
                if (isPlaying) main.post(ticker);
                else emit();
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                emit();
            }

            @Override
            public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
                emit();
            }

            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                lastError = error.getErrorCodeName() + ": " + error.getMessage();
                emit();
            }

            @Override
            public void onPositionDiscontinuity(@NonNull Player.PositionInfo oldPosition, @NonNull Player.PositionInfo newPosition, int reason) {
                emit();
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
                remote("next");
            }

            @Override
            public void seekToNextMediaItem() {
                remote("next");
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

    /** load a stream (http/https/file) with the request headers its client needs */
    public void load(String url, Map<String, String> headers, String title, String artist, String album,
                     String artwork, long startPositionMs, boolean playWhenReady) {
        lastError = null;
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .setAlbumTitle(album)
            .setIsPlayable(true);
        final int generation = ++loadGeneration;
        boolean fetchArtwork = false;
        if (artwork != null && !artwork.isEmpty()) {
            if (artwork.startsWith("data:")) {
                try {
                    String b64 = artwork.substring(artwork.indexOf(',') + 1);
                    meta.setArtworkData(Base64.decode(b64, Base64.DEFAULT), MediaMetadata.PICTURE_TYPE_FRONT_COVER);
                } catch (IllegalArgumentException ignored) {
                }
            } else if (artwork.startsWith("http")) {
                // loaded here (not by the session's bitmap loader) so it works
                // for every cover host and stays a sane size
                fetchArtwork = true;
            }
        }
        MediaItem item = new MediaItem.Builder()
            .setUri(Uri.parse(url))
            .setMediaMetadata(meta.build())
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
        MediaSource source = new ProgressiveMediaSource.Factory(new DefaultDataSource.Factory(context, http))
            .createMediaSource(item);

        player.setMediaSource(source, Math.max(0, startPositionMs));
        player.prepare();
        player.setPlayWhenReady(playWhenReady);
        emit();
        if (fetchArtwork) loadArtwork(artwork, generation);
    }

    private void loadArtwork(String url, int generation) {
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
                MediaItem current = player.getCurrentMediaItem();
                if (current == null) return;
                MediaMetadata updated = current.mediaMetadata.buildUpon()
                    .setArtworkData(data, MediaMetadata.PICTURE_TYPE_FRONT_COVER)
                    .build();
                player.replaceMediaItem(player.getCurrentMediaItemIndex(),
                    current.buildUpon().setMediaMetadata(updated).build());
            });
        });
    }

    public void setRate(float rate) {
        player.setPlaybackParameters(new PlaybackParameters(rate));
    }
}
