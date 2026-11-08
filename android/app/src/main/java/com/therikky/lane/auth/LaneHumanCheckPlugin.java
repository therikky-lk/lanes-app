package com.therikky.lane.auth;

import android.annotation.SuppressLint;
import android.app.Dialog;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import org.json.JSONObject;

/** First-party verification in its own browser context, sharing the login cookie jar. */
@CapacitorPlugin(name = "LaneHumanCheck")
public class LaneHumanCheckPlugin extends Plugin {
    private Session active;

    @PluginMethod
    public void verify(PluginCall call) {
        String url = call.getString("url", "");
        String action = call.getString("action", "");
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
            || !"/v1/auth/verify".equals(uri.getPath())
            || !("login".equals(action) || "register".equals(action))
            || !action.equals(uri.getQueryParameter("action"))) {
            call.reject("Invalid verification URL");
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
                || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                call.reject("Update Android System WebView to complete verification");
                return;
            }
            if (active != null) active.finish(null, null);
            active = new Session(call, uri, action);
            active.show();
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (active != null && active.id.equals(call.getString("id", ""))) active.finish(null, null);
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (active != null) active.finish(null, null);
    }

    private class Session {
        final PluginCall call;
        final String id, action, origin;
        final Uri uri;
        final Handler handler = new Handler(Looper.getMainLooper());
        final Runnable timeout = () -> finish(null, "Verification timed out");
        Dialog dialog;
        WebView web;
        boolean done;

        Session(PluginCall call, Uri uri, String action) {
            this.call = call;
            this.id = call.getString("id", "");
            this.uri = uri;
            this.action = action;
            this.origin = "https://" + uri.getEncodedAuthority();
        }

        @SuppressLint("SetJavaScriptEnabled")
        void show() {
            dialog = new Dialog(getActivity());
            LinearLayout content = new LinearLayout(getActivity());
            content.setOrientation(LinearLayout.VERTICAL);
            content.setPadding(dp(18), dp(18), dp(18), dp(12));
            content.setBackgroundColor(Color.rgb(32, 32, 35));
            TextView title = new TextView(getActivity());
            title.setText(call.getString("title", ""));
            title.setTextColor(Color.WHITE);
            title.setTextSize(16);
            content.addView(title);
            web = new WebView(getActivity());
            web.setBackgroundColor(Color.TRANSPARENT);
            web.getSettings().setJavaScriptEnabled(true);
            web.getSettings().setDomStorageEnabled(true);
            web.getSettings().setAllowFileAccess(false);
            web.getSettings().setAllowContentAccess(false);
            String ua = call.getString("userAgent");
            if (ua != null && !ua.isEmpty()) web.getSettings().setUserAgentString(ua);
            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
            // No Capacitor bridge on this remote page. Only its exact origin can
            // send a verification result, and only from the main frame.
            WebViewCompat.addWebMessageListener(web, "LaneVerification", Collections.singleton(origin),
                (view, message, source, mainFrame, reply) -> {
                    if (done || !mainFrame || !origin.equals(source.toString())) return;
                    try {
                        JSONObject data = new JSONObject(message.getData());
                        if (!"liner-turnstile".equals(data.optString("source")) || !action.equals(data.optString("action"))) return;
                        String type = data.optString("type");
                        String token = data.optString("token");
                        if ("token".equals(type) && !token.isEmpty()) finish(token, null);
                        else if ("error".equals(type) || "expired".equals(type)) finish(null, "Verification " + type);
                    } catch (Exception ignored) { }
                });
            String script = "window.addEventListener('message',function(e){"
                + "if(e.source!==window||e.origin!==location.origin)return;"
                + "var d=e.data;if(d&&d.source==='liner-turnstile')"
                + "window.LaneVerification.postMessage(JSON.stringify(d));});";
            WebViewCompat.addDocumentStartJavaScript(web, script, Collections.singleton(origin));
            web.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    // Challenge subframes may use Cloudflare, about:blank and srcdoc.
                    return request.isForMainFrame() && !origin.equals(originOf(request.getUrl()));
                }
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) finish(null, "Verification load failed (" + error.getErrorCode() + ")");
                }
                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                    // A 403 can be a solvable Cloudflare challenge, so render it.
                    if (request.isForMainFrame() && response.getStatusCode() != 403)
                        finish(null, "Verification HTTP " + response.getStatusCode());
                }
            });
            // Interactive Turnstile challenges can expand after the first tap;
            // keep enough room so the challenge isn't clipped in the dialog.
            content.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(240)));
            Button cancel = new Button(getActivity());
            cancel.setText(call.getString("cancel", ""));
            cancel.setOnClickListener(v -> finish(null, null));
            content.addView(cancel);
            dialog.setContentView(content);
            dialog.setCanceledOnTouchOutside(false);
            dialog.setOnDismissListener(d -> finish(null, null));
            dialog.show();
            if (dialog.getWindow() != null) dialog.getWindow().setLayout(
                Math.min(dp(380), getContext().getResources().getDisplayMetrics().widthPixels - dp(24)),
                ViewGroup.LayoutParams.WRAP_CONTENT);
            handler.postDelayed(timeout, 60_000);
            web.loadUrl(uri.toString());
        }

        void finish(String token, String error) {
            if (done) return;
            done = true;
            handler.removeCallbacks(timeout);
            CookieManager.getInstance().flush();
            if (active == this) active = null;
            if (dialog != null) dialog.dismiss();
            if (web != null) { web.stopLoading(); web.destroy(); }
            if (error != null) call.reject(error);
            else {
                JSObject result = new JSObject();
                if (token != null) result.put("token", token);
                call.resolve(result);
            }
        }
    }

    private String originOf(Uri uri) { return uri.getScheme() + "://" + uri.getEncodedAuthority(); }
    private int dp(int value) { return Math.round(value * getContext().getResources().getDisplayMetrics().density); }
}
