package com.therikky.lane.http;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.therikky.lane.net.Net;

import org.chromium.net.CronetEngine;
import org.chromium.net.CronetException;
import org.chromium.net.UploadDataProviders;
import org.chromium.net.UrlRequest;
import org.chromium.net.UrlResponseInfo;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * HTTP for YouTube / googlevideo requests: every header is sent exactly as
 * given (User-Agent, Origin, Referer included) and bodies travel as base64.
 * Uses the Chromium stack (Cronet) when available, else HttpURLConnection.
 */
@CapacitorPlugin(name = "LaneHttp")
public class LaneHttpPlugin extends Plugin {

    private static final int MAX_BODY = 32 * 1024 * 1024;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    @Override
    public void load() {
        Net.init(getContext());
    }

    private static final class Result {
        int status;
        String url;
        final Map<String, String> headers = new LinkedHashMap<>();
        byte[] body = new byte[0];
        String via;
    }

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("bad url");
            return;
        }
        String method = call.getString("method", "GET").toUpperCase();
        JSObject headers = call.getObject("headers", new JSObject());
        String b64 = call.getString("body");
        byte[] body = b64 != null && !b64.isEmpty() && !"GET".equals(method) && !"HEAD".equals(method)
            ? Base64.decode(b64, Base64.DEFAULT) : null;
        Map<String, String> requestHeaders = new LinkedHashMap<>();
        if (Boolean.TRUE.equals(call.getBoolean("withCookies", false))) {
            // Spotify import: the user's login lives in the app cookie store
            String host = android.net.Uri.parse(url).getHost();
            if (host != null && host.endsWith(".spotify.com")) {
                String cookies = android.webkit.CookieManager.getInstance().getCookie(url);
                if (cookies != null && !cookies.isEmpty()) requestHeaders.put("Cookie", cookies);
            }
        }
        if (headers != null) {
            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                String v = headers.optString(k, null);
                // the stack negotiates compression and length itself
                if (v == null || "accept-encoding".equalsIgnoreCase(k) || "content-length".equalsIgnoreCase(k)
                    || "host".equalsIgnoreCase(k) || "connection".equalsIgnoreCase(k)) continue;
                requestHeaders.put(k, v);
            }
        }
        pool.execute(() -> {
            Result result = null;
            String cronetError = null;
            CronetEngine engine = Net.engine();
            if (engine != null) {
                try {
                    result = viaCronet(engine, url, method, requestHeaders, body);
                } catch (Exception e) {
                    cronetError = e.getMessage();
                }
            }
            if (result == null) {
                try {
                    result = viaJava(url, method, requestHeaders, body);
                } catch (Exception e) {
                    String message = e.getClass().getSimpleName() + ": " + e.getMessage();
                    call.reject(cronetError != null ? "cronet: " + cronetError + "; java: " + message : message);
                    return;
                }
            }
            JSObject resHeaders = new JSObject();
            for (Map.Entry<String, String> e : result.headers.entrySet()) resHeaders.put(e.getKey(), e.getValue());
            JSObject res = new JSObject();
            res.put("status", result.status);
            res.put("url", result.url);
            res.put("headers", resHeaders);
            res.put("via", result.via);
            res.put("body", Base64.encodeToString(result.body, Base64.NO_WRAP));
            call.resolve(res);
        });
    }

    private Result viaCronet(CronetEngine engine, String url, String method, Map<String, String> headers, byte[] body) throws Exception {
        Result result = new Result();
        result.via = "cronet";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        CountDownLatch done = new CountDownLatch(1);
        final Exception[] failure = new Exception[1];
        // a redirect away from Spotify while the user's Spotify cookies are
        // attached: Cronet would resend them there, so it's followed by hand
        final String[] offsite = new String[1];
        final int[] offsiteStatus = new int[1];

        UrlRequest.Callback callback = new UrlRequest.Callback() {
            @Override
            public void onRedirectReceived(UrlRequest request, UrlResponseInfo info, String newLocationUrl) {
                if (hasCookie(headers) && !isSpotify(newLocationUrl)) {
                    offsite[0] = newLocationUrl;
                    offsiteStatus[0] = info.getHttpStatusCode();
                    request.cancel();
                    return;
                }
                request.followRedirect();
            }

            @Override
            public void onResponseStarted(UrlRequest request, UrlResponseInfo info) {
                result.status = info.getHttpStatusCode();
                result.url = info.getUrl();
                for (Map.Entry<String, List<String>> e : info.getAllHeaders().entrySet()) {
                    String key = e.getKey().toLowerCase();
                    if ("content-encoding".equals(key) || "content-length".equals(key)) continue;
                    result.headers.put(key, String.join(", ", e.getValue()));
                }
                request.read(ByteBuffer.allocateDirect(64 * 1024));
            }

            @Override
            public void onReadCompleted(UrlRequest request, UrlResponseInfo info, ByteBuffer buffer) {
                buffer.flip();
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                out.write(chunk, 0, chunk.length);
                if (out.size() > MAX_BODY) {
                    failure[0] = new IllegalStateException("response too large");
                    request.cancel();
                    return;
                }
                buffer.clear();
                request.read(buffer);
            }

            @Override
            public void onSucceeded(UrlRequest request, UrlResponseInfo info) {
                done.countDown();
            }

            @Override
            public void onFailed(UrlRequest request, UrlResponseInfo info, CronetException error) {
                failure[0] = error;
                done.countDown();
            }

            @Override
            public void onCanceled(UrlRequest request, UrlResponseInfo info) {
                if (failure[0] == null) failure[0] = new IllegalStateException("canceled");
                done.countDown();
            }
        };

        UrlRequest.Builder builder = engine.newUrlRequestBuilder(url, callback, Net.executor())
            .setHttpMethod(method)
            .disableCache();
        for (Map.Entry<String, String> e : headers.entrySet()) builder.addHeader(e.getKey(), e.getValue());
        if (body != null) {
            if (!headers.keySet().stream().anyMatch(k -> k.equalsIgnoreCase("content-type"))) {
                builder.addHeader("Content-Type", "application/octet-stream");
            }
            builder.setUploadDataProvider(UploadDataProviders.create(body), Net.executor());
        }
        UrlRequest request = builder.build();
        request.start();
        if (!done.await(35, TimeUnit.SECONDS)) {
            request.cancel();
            throw new IllegalStateException("timed out");
        }
        if (offsite[0] != null) {
            boolean toGet = offsiteStatus[0] == 303 || ((offsiteStatus[0] == 301 || offsiteStatus[0] == 302) && "POST".equals(method));
            return viaCronet(engine, offsite[0], toGet ? "GET" : method, withoutCookie(headers), toGet ? null : body);
        }
        if (failure[0] != null) throw failure[0];
        result.body = "HEAD".equals(method) ? new byte[0] : out.toByteArray();
        return result;
    }

    private static boolean isSpotify(String url) {
        String host = android.net.Uri.parse(url).getHost();
        return host != null && (host.equals("spotify.com") || host.endsWith(".spotify.com"));
    }

    private static boolean hasCookie(Map<String, String> headers) {
        for (String k : headers.keySet()) if ("cookie".equalsIgnoreCase(k)) return true;
        return false;
    }

    private static Map<String, String> withoutCookie(Map<String, String> headers) {
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : headers.entrySet()) {
            if (!"cookie".equalsIgnoreCase(e.getKey())) out.put(e.getKey(), e.getValue());
        }
        return out;
    }

    private Result viaJava(String url, String method, Map<String, String> headers, byte[] body) throws Exception {
        return viaJava(url, method, headers, body, 0);
    }

    private Result viaJava(String url, String method, Map<String, String> headers, byte[] body, int redirects) throws Exception {
        Result result = new Result();
        result.via = "java";
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setRequestMethod(method);
            conn.setConnectTimeout(20_000);
            conn.setReadTimeout(30_000);
            // with Spotify cookies attached, redirects are followed by hand so
            // the cookies never go to another site
            boolean cookies = hasCookie(headers);
            conn.setInstanceFollowRedirects(!cookies);
            conn.setUseCaches(false);
            for (Map.Entry<String, String> e : headers.entrySet()) conn.setRequestProperty(e.getKey(), e.getValue());
            if (body != null) {
                conn.setDoOutput(true);
                conn.setFixedLengthStreamingMode(body.length);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(body);
                }
            }
            result.status = conn.getResponseCode();
            if (cookies && result.status >= 300 && result.status < 400 && conn.getHeaderField("Location") != null) {
                String next = new URL(conn.getURL(), conn.getHeaderField("Location")).toString();
                boolean toGet = result.status == 303 || ((result.status == 301 || result.status == 302) && "POST".equals(method));
                if (redirects >= 10) throw new IllegalStateException("too many redirects");
                return viaJava(next, toGet ? "GET" : method, isSpotify(next) ? headers : withoutCookie(headers), toGet ? null : body, redirects + 1);
            }
            result.url = conn.getURL().toString();
            InputStream in = result.status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (in != null && !"HEAD".equals(method)) {
                try (InputStream stream = in) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[32768];
                    int n;
                    while ((n = stream.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        if (out.size() > MAX_BODY) throw new IllegalStateException("response too large");
                    }
                    result.body = out.toByteArray();
                }
            }
            for (Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
                if (e.getKey() == null || e.getValue() == null || e.getValue().isEmpty()) continue;
                String key = e.getKey().toLowerCase();
                if ("content-encoding".equals(key) || "content-length".equals(key)) continue;
                result.headers.put(key, String.join(", ", e.getValue()));
            }
            return result;
        } finally {
            conn.disconnect();
        }
    }

    @Override
    protected void handleOnDestroy() {
        pool.shutdownNow();
        super.handleOnDestroy();
    }
}
