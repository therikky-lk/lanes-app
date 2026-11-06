package com.therikky.lane.sharing;

import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LaneShare")
public class LaneSharePlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.matches("https://lane-app\\.site/s/[A-Za-z0-9_-]{22}")) {
            call.reject("Invalid Lane share URL");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_SUBJECT, call.getString("title", "Lane"));
                send.putExtra(Intent.EXTRA_TEXT, url);
                getActivity().startActivity(Intent.createChooser(send, null));
                call.resolve();
            } catch (Exception error) { call.reject("Could not open share menu", error); }
        });
    }
}
