package com.therikky.lane.net;

import android.content.Context;
import android.util.Log;

import com.google.android.gms.net.CronetProviderInstaller;

import org.chromium.net.CronetEngine;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Shared Chromium network stack (Cronet from Google Play services). It talks
 * TLS exactly like Chrome and can use HTTP/3, which gets through networks where
 * plain Java HTTPS to googlevideo is cut off during the handshake. Falls back to
 * HttpURLConnection when Play services Cronet isn't available.
 */
public final class Net {
    private static final String TAG = "LaneNet";
    private static volatile CronetEngine engine;
    private static volatile boolean started;
    private static final ExecutorService executor = Executors.newFixedThreadPool(4);

    private Net() {}

    public static synchronized void init(Context context) {
        if (started) return;
        started = true;
        Context app = context.getApplicationContext();
        try {
            CronetProviderInstaller.installProvider(app).addOnCompleteListener(task -> {
                try {
                    engine = new CronetEngine.Builder(app)
                        .enableHttp2(true)
                        .enableQuic(true)
                        .enableBrotli(true)
                        .build();
                    Log.i(TAG, "Cronet ready: " + engine.getVersionString());
                } catch (Throwable t) {
                    Log.w(TAG, "Cronet unavailable", t);
                }
            });
        } catch (Throwable t) {
            Log.w(TAG, "Cronet provider install failed", t);
        }
    }

    /** null until Cronet is ready (or when it isn't available at all) */
    public static CronetEngine engine() {
        return engine;
    }

    public static ExecutorService executor() {
        return executor;
    }

    public static String describe() {
        CronetEngine e = engine;
        return e != null ? "cronet " + e.getVersionString() : "java";
    }
}
