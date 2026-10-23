package com.therikky.lane.http;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Plain HTTP for YouTube / googlevideo requests: every header is sent exactly
 * as given (User-Agent, Origin, Referer included) and bodies travel as base64,
 * so nothing is lost on the way like with the WebView's own fetch.
 */
@CapacitorPlugin(name = "LaneHttp")
public class LaneHttpPlugin extends Plugin {

    private static final int MAX_BODY = 32 * 1024 * 1024;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("bad url");
            return;
        }
        String method = call.getString("method", "GET").toUpperCase();
        JSObject headers = call.getObject("headers", new JSObject());
        String body = call.getString("body");
        pool.execute(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestMethod(method);
                conn.setConnectTimeout(20_000);
                conn.setReadTimeout(30_000);
                conn.setInstanceFollowRedirects(true);
                conn.setUseCaches(false);
                if (headers != null) {
                    Iterator<String> keys = headers.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        String v = headers.optString(k, null);
                        // let HttpURLConnection negotiate gzip and decode it itself
                        if (v != null && !"accept-encoding".equalsIgnoreCase(k)) conn.setRequestProperty(k, v);
                    }
                }
                if (body != null && !body.isEmpty() && !"GET".equals(method) && !"HEAD".equals(method)) {
                    byte[] bytes = Base64.decode(body, Base64.DEFAULT);
                    conn.setDoOutput(true);
                    conn.setFixedLengthStreamingMode(bytes.length);
                    try (OutputStream out = conn.getOutputStream()) {
                        out.write(bytes);
                    }
                }
                int status = conn.getResponseCode();
                InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                byte[] data = new byte[0];
                if (in != null && !"HEAD".equals(method)) {
                    try (InputStream stream = in) {
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        byte[] buf = new byte[32768];
                        int n;
                        while ((n = stream.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            if (out.size() > MAX_BODY) throw new IllegalStateException("response too large");
                        }
                        data = out.toByteArray();
                    }
                }
                JSObject resHeaders = new JSObject();
                for (Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
                    if (e.getKey() == null || e.getValue() == null || e.getValue().isEmpty()) continue;
                    resHeaders.put(e.getKey().toLowerCase(), String.join(", ", e.getValue()));
                }
                JSObject res = new JSObject();
                res.put("status", status);
                res.put("url", conn.getURL().toString());
                res.put("headers", resHeaders);
                res.put("body", Base64.encodeToString(data, Base64.NO_WRAP));
                call.resolve(res);
            } catch (Exception e) {
                call.reject(e.getClass().getSimpleName() + ": " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        pool.shutdownNow();
        super.handleOnDestroy();
    }
}
