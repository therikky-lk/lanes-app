package com.therikky.lane;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import com.therikky.lane.audio.LaneAudioPlugin;
import com.therikky.lane.potoken.LanePoTokenPlugin;
import com.therikky.lane.http.LaneHttpPlugin;
import com.therikky.lane.spotify.LaneSpotifyPlugin;

import java.util.Locale;

public class MainActivity extends BridgeActivity {

    // last system bar insets in CSS px, re-sent after every page load
    private int insetTop, insetBottom, insetLeft, insetRight;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LaneAudioPlugin.class);
        registerPlugin(LanePoTokenPlugin.class);
        registerPlugin(LaneHttpPlugin.class);
        registerPlugin(LaneSpotifyPlugin.class);
        super.onCreate(savedInstanceState);
        com.therikky.lane.net.Net.init(this);
        drawEdgeToEdge();
        keepWebViewAliveInBackground();
    }

    /**
     * The app draws behind the status bar and the gesture / navigation bar; the
     * web layout keeps its controls clear of them using --lane-safe-* CSS vars.
     */
    private void drawEdgeToEdge() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);

        View decor = window.getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            // the keyboard still shrinks the page so inputs stay visible
            v.setPadding(0, 0, 0, keyboard ? ime.bottom : 0);

            float density = getResources().getDisplayMetrics().density;
            insetTop = Math.round(sys.top / density);
            insetBottom = keyboard ? 0 : Math.round(sys.bottom / density);
            insetLeft = Math.round(sys.left / density);
            insetRight = Math.round(sys.right / density);
            pushInsets();

            // insets are handled by the page; returning CONSUMED would break the
            // WebView's own recalculation (chromium 461332423)
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                .build();
        });

        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                pushInsets();
            }

            @Override
            public void onPageLoaded(WebView webView) {
                pushInsets();
            }
        });
        decor.requestApplyInsets();
    }

    /**
     * Playback runs natively, but the queue (what plays next) lives in the page:
     * keep its renderer as important as the app (which runs a foreground media
     * service) so Android doesn't freeze it while the screen is off.
     */
    private void keepWebViewAliveInBackground() {
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web != null) web.resumeTimers();
    }

    @Override
    public void onStop() {
        super.onStop();
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web != null) web.resumeTimers();
    }

    private void pushInsets() {
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        String js = String.format(Locale.US,
            "(function(s){s.setProperty('--lane-safe-top','%dpx');s.setProperty('--lane-safe-bottom','%dpx');" +
                "s.setProperty('--lane-safe-left','%dpx');s.setProperty('--lane-safe-right','%dpx');})" +
                "(document.documentElement.style)",
            insetTop, insetBottom, insetLeft, insetRight);
        web.post(() -> web.evaluateJavascript(js, null));
    }
}
