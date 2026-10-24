package com.therikky.lane.power;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS bridge (src/shared/platform/keepAwake.ts): hold the app awake during a
 * long job, and let the user take Lane out of battery optimization so the
 * system doesn't put it to sleep (which also cuts background playback on many
 * phones).
 */
@CapacitorPlugin(name = "LaneKeepAwake")
public class LaneKeepAwakePlugin extends Plugin {

    private Intent intent(String action) {
        return new Intent(getContext(), LaneKeepAwakeService.class).setAction(action);
    }

    @PluginMethod
    public void start(PluginCall call) {
        Intent i = intent(LaneKeepAwakeService.ACTION_START)
            .putExtra(LaneKeepAwakeService.EXTRA_TITLE, call.getString("title", "Lane"))
            .putExtra(LaneKeepAwakeService.EXTRA_TEXT, call.getString("text", ""))
            .putExtra(LaneKeepAwakeService.EXTRA_PROGRESS, (int) call.getInt("progress", 0))
            .putExtra(LaneKeepAwakeService.EXTRA_MAX, (int) call.getInt("max", 0));
        try {
            ContextCompat.startForegroundService(getContext(), i);
            call.resolve();
        } catch (Exception e) {
            call.reject("keep-awake failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void update(PluginCall call) {
        Intent i = intent(LaneKeepAwakeService.ACTION_UPDATE);
        if (call.hasOption("title")) i.putExtra(LaneKeepAwakeService.EXTRA_TITLE, call.getString("title"));
        if (call.hasOption("text")) i.putExtra(LaneKeepAwakeService.EXTRA_TEXT, call.getString("text"));
        if (call.hasOption("progress")) i.putExtra(LaneKeepAwakeService.EXTRA_PROGRESS, (int) call.getInt("progress", 0));
        if (call.hasOption("max")) i.putExtra(LaneKeepAwakeService.EXTRA_MAX, (int) call.getInt("max", 0));
        try {
            // the service is already in the foreground, so a plain start is allowed
            // even with the app in the background (startForegroundService is not)
            getContext().startService(i);
        } catch (Exception ignored) {
            // the service is already running; an update that can't be delivered is harmless
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().startService(intent(LaneKeepAwakeService.ACTION_STOP));
        } catch (Exception ignored) {
            getContext().stopService(new Intent(getContext(), LaneKeepAwakeService.class));
        }
        call.resolve();
    }

    private boolean ignoringOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    @PluginMethod
    public void batteryStatus(PluginCall call) {
        JSObject res = new JSObject();
        res.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M);
        res.put("ignoring", ignoringOptimizations());
        call.resolve(res);
    }

    /** opens the system prompt "let Lane run in the background?" */
    @SuppressLint("BatteryLife")
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        JSObject res = new JSObject();
        if (ignoringOptimizations()) {
            res.put("ignoring", true);
            call.resolve(res);
            return;
        }
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            // some firmwares hide the direct prompt: open the list instead
            try {
                getContext().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception ignored) {
            }
        }
        res.put("ignoring", ignoringOptimizations());
        call.resolve(res);
    }
}
