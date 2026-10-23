package com.therikky.lane.potoken;

import android.annotation.SuppressLint;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * YouTube Music only serves full streams with a BotGuard PO token. Like the
 * desktop app's hidden window, a hidden WebView on youtube.com runs BotGuard
 * (assets/lane-potoken.js, built from android-web/potoken.ts) and mints them.
 */
@CapacitorPlugin(name = "LanePoToken")
public class LanePoTokenPlugin extends Plugin {

    private static final String PAGE = "https://www.youtube.com/robots.txt";
    private static final long MINT_TIMEOUT_MS = 30_000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicInteger nextId = new AtomicInteger(1);
    private final Map<Integer, PluginCall> pending = new HashMap<>();
    private final List<Runnable> whenReady = new ArrayList<>();

    private WebView web;
    private boolean ready;

    @PluginMethod
    public void mint(PluginCall call) {
        String identifier = call.getString("identifier");
        if (identifier == null || !identifier.matches("[\\w-]{1,128}")) {
            call.reject("invalid identifier");
            return;
        }
        int id = nextId.getAndIncrement();
        main.post(() -> {
            pending.put(id, call);
            main.postDelayed(() -> {
                PluginCall timedOut = pending.remove(id);
                if (timedOut != null) {
                    timedOut.reject("PO token minting timed out");
                    destroyWebView();
                }
            }, MINT_TIMEOUT_MS);
            runWhenReady(() -> web.evaluateJavascript(
                "window.__laneMint(" + id + "," + JSONObject.quote(identifier) + ")", null));
        });
    }

    private void runWhenReady(Runnable task) {
        if (web != null && ready) {
            task.run();
            return;
        }
        whenReady.add(task);
        if (web == null) createWebView();
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void createWebView() {
        ready = false;
        web = new WebView(getContext());
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "LanePo");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (view != web || ready) return;
                String script = readAsset("lane-potoken.js");
                if (script == null) {
                    failAll("PO token script is missing");
                    return;
                }
                view.evaluateJavascript(script, null);
            }
        });
        web.loadUrl(PAGE);
    }

    private void destroyWebView() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        ready = false;
    }

    private void failAll(String message) {
        for (PluginCall call : pending.values()) call.reject(message);
        pending.clear();
        whenReady.clear();
        destroyWebView();
    }

    private String readAsset(String name) {
        try (InputStream in = getContext().getAssets().open(name)) {
            return new String(readAll(in), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    @Override
    protected void handleOnDestroy() {
        main.post(this::destroyWebView);
        io.shutdownNow();
        super.handleOnDestroy();
    }

    private class Bridge {
        @JavascriptInterface
        public void ready() {
            main.post(() -> {
                ready = true;
                List<Runnable> tasks = new ArrayList<>(whenReady);
                whenReady.clear();
                for (Runnable task : tasks) task.run();
            });
        }

        @JavascriptInterface
        public void result(int id, String token, String error) {
            main.post(() -> {
                PluginCall call = pending.remove(id);
                if (call == null) return;
                if (token != null && !token.isEmpty()) {
                    JSObject res = new JSObject();
                    res.put("token", token);
                    call.resolve(res);
                } else {
                    call.reject(error == null || error.isEmpty() ? "PO token minting failed" : error);
                }
            });
        }

        /** the BotGuard interpreter lives on google.com: fetch it natively (no CORS) */
        @JavascriptInterface
        public void interpreter(int id, String url) {
            io.execute(() -> {
                String script = null;
                String error = null;
                try {
                    URL target = new URL(url);
                    String host = target.getHost();
                    if (!"https".equals(target.getProtocol()) || !(host.equals("www.google.com") || host.equals("www.gstatic.com"))) {
                        throw new IllegalArgumentException("interpreter host not allowed");
                    }
                    HttpURLConnection conn = (HttpURLConnection) target.openConnection();
                    conn.setConnectTimeout(15_000);
                    conn.setReadTimeout(15_000);
                    if (conn.getResponseCode() != 200) throw new IllegalStateException("interpreter HTTP " + conn.getResponseCode());
                    try (InputStream in = conn.getInputStream()) {
                        script = new String(readAll(in), StandardCharsets.UTF_8);
                    }
                } catch (Exception e) {
                    error = e.getMessage();
                }
                String js = "window.__laneInterpreter(" + id + "," + (script == null ? "null" : JSONObject.quote(script))
                    + "," + (error == null ? "null" : JSONObject.quote(error)) + ")";
                main.post(() -> {
                    if (web != null) web.evaluateJavascript(js, null);
                });
            });
        }
    }
}
