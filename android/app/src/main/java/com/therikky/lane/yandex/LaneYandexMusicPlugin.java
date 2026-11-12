package com.therikky.lane.yandex;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.UUID;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "LaneYandexMusic")
public class LaneYandexMusicPlugin extends Plugin {
    // Public client ID for the Yandex Music web callback.
    private static final String CLIENT_ID = "23cabbbdc6cd418abb4b39c32c41195d";
    private static final String CALLBACK = "https://music.yandex.ru/";
    private static final long TIMEOUT_MS = 10 * 60_000;
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9._~+/-]{8,2048}={0,2}");

    private final Handler ui = new Handler(Looper.getMainLooper());
    private Login active;

    @PluginMethod
    public void signIn(PluginCall call) {
        ui.post(() -> {
            Activity activity = getActivity();
            if (active != null || activity == null || activity.isFinishing() || activity.isDestroyed()) {
                resolve(call, "failed", null);
                return;
            }
            active = new Login(activity, call);
            active.show();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (active != null) active.finish("cancelled", null);
    }

    private static void resolve(PluginCall call, String status, String token) {
        JSObject result = new JSObject();
        result.put("status", status);
        if (token != null) result.put("token", token);
        call.resolve(result);
    }

    private static boolean allowed(Uri uri) {
        if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null
            || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getHost() == null) return false;
        switch (uri.getHost()) {
            case "oauth.yandex.ru":
            case "passport.yandex.ru":
            case "id.yandex.ru":
            case "music.yandex.ru":
            case "oauth.yandex.com":
            case "passport.yandex.com":
            case "id.yandex.com":
            case "smartcaptcha.yandexcloud.net":
                return true;
            default:
                return false;
        }
    }

    private final class Login {
        private final PluginCall call;
        private final String state = UUID.randomUUID().toString();
        private final Dialog dialog;
        private final WebView webView;
        private final Runnable timeout = () -> finish("failed", null);
        private boolean finished;

        @SuppressLint("SetJavaScriptEnabled")
        Login(Activity activity, PluginCall call) {
            this.call = call;
            dialog = new Dialog(activity, android.R.style.Theme_Black_NoTitleBar);
            webView = new WebView(activity);
            webView.getSettings().setJavaScriptEnabled(true);
            webView.getSettings().setDomStorageEnabled(true);
            webView.getSettings().setAllowFileAccess(false);
            webView.getSettings().setAllowContentAccess(false);
            webView.getSettings().setSupportMultipleWindows(true);
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (!request.isForMainFrame()) return false;
                    Uri uri = request.getUrl();
                    return !allowed(uri) || handleCallback(uri);
                }

                @Override
                public void doUpdateVisitedHistory(WebView view, String url, boolean reload) {
                    if (url != null) handleCallback(Uri.parse(url));
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) finish("failed", null);
                }
            });
            dialog.setContentView(webView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            dialog.setOnDismissListener(ignored -> finish("cancelled", null));
        }

        void show() {
            Uri url = Uri.parse("https://oauth.yandex.ru/authorize").buildUpon()
                .appendQueryParameter("response_type", "token")
                .appendQueryParameter("client_id", CLIENT_ID)
                .appendQueryParameter("state", state)
                .appendQueryParameter("force_confirm", "yes")
                .build();
            dialog.show();
            Window window = dialog.getWindow();
            if (window != null) window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            ui.postDelayed(timeout, TIMEOUT_MS);
            webView.loadUrl(url.toString());
        }

        private boolean handleCallback(Uri uri) {
            String path = uri.getEncodedPath();
            if (!allowed(uri) || !"music.yandex.ru".equals(uri.getHost())
                || (path != null && !path.isEmpty() && !"/".equals(path)) || uri.getEncodedFragment() == null) return false;
            Uri params = Uri.parse(CALLBACK + "?" + uri.getEncodedFragment());
            String token = params.getQueryParameter("access_token");
            String error = params.getQueryParameter("error");
            if (token == null && error == null) return false;
            if (params.getQueryParameters("state").size() == 1 && state.equals(params.getQueryParameter("state"))
                && params.getQueryParameters("access_token").size() == 1 && error == null && token != null
                && TOKEN.matcher(token).matches()) {
                finish("success", token);
            } else {
                finish("failed", null);
            }
            return true;
        }

        void finish(String status, String token) {
            if (finished) return;
            finished = true;
            ui.removeCallbacks(timeout);
            // Tear the WebView down after its navigation callback has returned.
            ui.post(() -> {
                dialog.dismiss();
                webView.stopLoading();
                if (webView.getParent() instanceof ViewGroup) {
                    ((ViewGroup) webView.getParent()).removeView(webView);
                }
                webView.destroy();
                if (active == this) active = null;
                resolve(call, status, token);
            });
        }
    }
}
