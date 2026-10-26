package com.therikky.lane.audio;

import android.content.ComponentName;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import androidx.annotation.OptIn;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.io.FileOutputStream;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/** JS bridge to the native player (see src/shared/platform/nativeAudio.ts). */
@OptIn(markerClass = UnstableApi.class)
@CapacitorPlugin(name = "LaneAudio")
public class LaneAudioPlugin extends Plugin implements PlayerHolder.Events {

    /** audio files kept in the cache dir: current track + 10 queued ahead, twice over */
    private static final int KEPT_CACHE_FILES = 24;

    private final Handler main = new Handler(Looper.getMainLooper());
    private ListenableFuture<MediaController> controller;

    @Override
    public void load() {
        main.post(() -> {
            PlayerHolder holder = PlayerHolder.get(getContext());
            holder.setEvents(this);
            // connecting a controller starts the session service, which then
            // runs in the foreground with the media notification while playing
            SessionToken token = new SessionToken(getContext(), new ComponentName(getContext(), LanePlaybackService.class));
            controller = new MediaController.Builder(getContext(), token).buildAsync();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (controller != null) MediaController.releaseFuture(controller);
        super.handleOnDestroy();
    }

    @Override
    public void onState(boolean playing, boolean playWhenReady, boolean buffering, boolean ended, boolean seekable,
                        long positionMs, long durationMs, String error) {
        JSObject data = new JSObject();
        data.put("playing", playing);
        data.put("playWhenReady", playWhenReady);
        data.put("seekable", seekable);
        data.put("buffering", buffering);
        data.put("ended", ended);
        data.put("positionMs", positionMs);
        data.put("durationMs", durationMs);
        if (error != null) data.put("error", error);
        notifyListeners("state", data);
    }

    @Override
    public void onRemote(String action, long positionMs) {
        JSObject data = new JSObject();
        data.put("action", action);
        data.put("positionMs", positionMs);
        notifyListeners("remote", data);
    }

    @Override
    public void onAdvanced(String trackId) {
        JSObject data = new JSObject();
        data.put("trackId", trackId);
        notifyListeners("advanced", data);
    }

    /**
     * A time in ms from JS. It arrives as a fraction (100000.4) whenever the
     * page computed it, and getLong() quietly returns the default for those:
     * every seek from the app landed at 0.
     */
    private static long millis(PluginCall call, String key) {
        Object raw = call.getData().opt(key);
        if (raw instanceof Number) return Math.max(0L, Math.round(((Number) raw).doubleValue()));
        if (raw instanceof String) {
            try {
                return Math.max(0L, Math.round(Double.parseDouble((String) raw)));
            } catch (NumberFormatException ignored) {
            }
        }
        return 0L;
    }

    private static Map<String, String> headersOf(PluginCall call) {
        Map<String, String> headers = new HashMap<>();
        JSObject h = call.getObject("headers", new JSObject());
        if (h != null) {
            Iterator<String> keys = h.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                String v = h.optString(k, null);
                if (v != null) headers.put(k, v);
            }
        }
        return headers;
    }

    @PluginMethod
    public void queueNext(PluginCall call) {
        String after = call.getString("afterTrackId");
        com.getcapacitor.JSArray items = call.getArray("items");
        if (after == null || items == null) {
            call.reject("afterTrackId and items are required");
            return;
        }
        java.util.List<PlayerHolder.NextSpec> queue = new java.util.ArrayList<>();
        try {
            for (int i = 0; i < items.length(); i++) {
                org.json.JSONObject o = items.getJSONObject(i);
                Map<String, String> headers = new HashMap<>();
                org.json.JSONObject h = o.optJSONObject("headers");
                if (h != null) {
                    Iterator<String> keys = h.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        String v = h.optString(k, null);
                        if (v != null) headers.put(k, v);
                    }
                }
                String url = o.optString("url", "");
                String trackId = o.optString("trackId", "");
                if (url.isEmpty() || trackId.isEmpty()) continue;
                queue.add(new PlayerHolder.NextSpec(trackId, url, headers,
                    o.optString("title", ""), o.optString("artist", ""),
                    o.optString("album", ""), o.optString("artwork", "")));
            }
        } catch (org.json.JSONException e) {
            call.reject("bad items: " + e.getMessage());
            return;
        }
        main.post(() -> {
            PlayerHolder.get(getContext()).queueNext(after, queue);
            call.resolve();
        });
    }

    @PluginMethod
    public void clearNext(PluginCall call) {
        main.post(() -> {
            PlayerHolder.get(getContext()).clearNext();
            call.resolve();
        });
    }

    @PluginMethod
    public void load(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("url is required");
            return;
        }
        Map<String, String> headers = headersOf(call);
        String trackId = call.getString("trackId", "");
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String album = call.getString("album", "");
        String artwork = call.getString("artwork", "");
        long start = millis(call, "startPositionMs");
        boolean autoplay = Boolean.TRUE.equals(call.getBoolean("autoplay", false));
        main.post(() -> {
            PlayerHolder.get(getContext()).load(trackId, url, headers, title, artist, album, artwork, start, autoplay);
            call.resolve();
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        main.post(() -> {
            PlayerHolder.get(getContext()).player().play();
            call.resolve();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        main.post(() -> {
            PlayerHolder.get(getContext()).player().pause();
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            PlayerHolder.get(getContext()).player().stop();
            PlayerHolder.get(getContext()).player().clearMediaItems();
            call.resolve();
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        long position = millis(call, "positionMs");
        main.post(() -> {
            PlayerHolder.get(getContext()).player().seekTo(Math.max(0, position));
            PlayerHolder.get(getContext()).emit();
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        float volume = call.getFloat("volume", 1f);
        main.post(() -> {
            PlayerHolder.get(getContext()).player().setVolume(Math.max(0f, Math.min(1f, volume)));
            call.resolve();
        });
    }

    @PluginMethod
    public void setRate(PluginCall call) {
        float rate = call.getFloat("rate", 1f);
        main.post(() -> {
            PlayerHolder.get(getContext()).setRate(Math.max(0.25f, Math.min(4f, rate)));
            call.resolve();
        });
    }

    @PluginMethod
    public void setRepeat(PluginCall call) {
        int mode = call.getInt("mode", 0);
        main.post(() -> {
            PlayerHolder.get(getContext()).setRepeatMode(Math.max(0, Math.min(2, mode)));
            call.resolve();
        });
    }

    @PluginMethod
    public void setLiked(PluginCall call) {
        boolean liked = Boolean.TRUE.equals(call.getBoolean("liked", false));
        main.post(() -> {
            PlayerHolder.get(getContext()).setLiked(liked);
            call.resolve();
        });
    }

    /** blobs (uploaded files, cached audio) can't be streamed natively: park them in the cache */
    @PluginMethod
    public void writeCacheFile(PluginCall call) {
        String name = call.getString("name", "audio.bin");
        String data = call.getString("base64");
        if (data == null) {
            call.reject("base64 is required");
            return;
        }
        try {
            File dir = new File(getContext().getCacheDir(), "lane-audio");
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("no cache dir");
            // keep the cache bounded: the most recent files only, but enough for
            // the current track plus the whole look-ahead (10 tracks) the app
            // hands over, so a queued file is never deleted before it plays
            File[] old = dir.listFiles();
            if (old != null && old.length > KEPT_CACHE_FILES) {
                java.util.Arrays.sort(old, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
                for (int i = 0; i < old.length - KEPT_CACHE_FILES; i++) //noinspection ResultOfMethodCallIgnored
                    old[i].delete();
            }
            File file = new File(dir, name.replaceAll("[^A-Za-z0-9._-]", "_"));
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            JSObject result = new JSObject();
            result.put("url", "file://" + file.getAbsolutePath());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("could not write cache file: " + e.getMessage());
        }
    }
}
