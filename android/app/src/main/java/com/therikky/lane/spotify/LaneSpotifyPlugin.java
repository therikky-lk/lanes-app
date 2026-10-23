package com.therikky.lane.spotify;

import android.annotation.SuppressLint;
import android.app.Dialog;
import android.graphics.Color;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Spotify account link for importing Liked Songs: the login runs in a WebView
 * dialog; its cookies stay in the app's cookie store and are attached by
 * LaneHttp to Spotify requests (withCookies), never handed to the page.
 */
@CapacitorPlugin(name = "LaneSpotify")
public class LaneSpotifyPlugin extends Plugin {

    private static final String LOGIN_URL = "https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F";

    static boolean hasSpotifyLogin() {
        String cookies = CookieManager.getInstance().getCookie("https://open.spotify.com");
        return cookies != null && cookies.contains("sp_dc=");
    }

    @PluginMethod
    public void hasLogin(PluginCall call) {
        JSObject res = new JSObject();
        res.put("value", hasSpotifyLogin());
        call.resolve(res);
    }

    @PluginMethod
    public void logout(PluginCall call) {
        CookieManager cm = CookieManager.getInstance();
        for (String url : new String[] {"https://open.spotify.com", "https://accounts.spotify.com", "https://www.spotify.com"}) {
            String cookies = cm.getCookie(url);
            if (cookies == null) continue;
            for (String part : cookies.split(";")) {
                String name = part.split("=")[0].trim();
                if (name.isEmpty()) continue;
                cm.setCookie(url, name + "=; Max-Age=0; Path=/; Domain=.spotify.com");
                cm.setCookie(url, name + "=; Max-Age=0; Path=/");
            }
        }
        cm.flush();
        call.resolve();
    }

    @SuppressLint("SetJavaScriptEnabled")
    @PluginMethod
    public void login(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Dialog dialog = new Dialog(getActivity(), android.R.style.Theme_Black_NoTitleBar_Fullscreen);
            WebView web = new WebView(getActivity());
            web.setBackgroundColor(Color.BLACK);
            web.getSettings().setJavaScriptEnabled(true);
            web.getSettings().setDomStorageEnabled(true);
            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
            final boolean[] done = {false};
            web.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return false;
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (done[0]) return;
                    CookieManager.getInstance().flush();
                    if (url != null && url.startsWith("https://open.spotify.com") && hasSpotifyLogin()) {
                        done[0] = true;
                        JSObject res = new JSObject();
                        res.put("value", true);
                        call.resolve(res);
                        dialog.dismiss();
                    }
                }
            });
            dialog.setContentView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            dialog.setOnDismissListener(d -> {
                web.destroy();
                if (!done[0]) {
                    done[0] = true;
                    JSObject res = new JSObject();
                    res.put("value", hasSpotifyLogin());
                    call.resolve(res);
                }
            });
            dialog.show();
            web.loadUrl(LOGIN_URL);
        });
    }
}
