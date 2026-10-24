package com.therikky.lane.power;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import com.therikky.lane.MainActivity;
import com.therikky.lane.R;

/**
 * Keeps Lane running while a long job (importing liked songs) works with the
 * screen off or the app in the background: a foreground service with a
 * progress notification, a CPU wake lock and a Wi-Fi lock. Without it Android
 * freezes the page (and its network) as soon as nothing is playing.
 */
public class LaneKeepAwakeService extends Service {

    static final String ACTION_START = "lane.keepawake.START";
    static final String ACTION_UPDATE = "lane.keepawake.UPDATE";
    static final String ACTION_STOP = "lane.keepawake.STOP";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";
    static final String EXTRA_PROGRESS = "progress";
    static final String EXTRA_MAX = "max";

    private static final String CHANNEL = "lane_jobs";
    private static final int NOTIFICATION_ID = 4711;
    // a safety net: the job refreshes its hold on every update
    private static final long WAKE_TIMEOUT_MS = 30 * 60 * 1000L;

    private PowerManager.WakeLock wakeLock;
    private boolean foreground = false;
    private WifiManager.WifiLock wifiLock;
    private String title = "Lane";
    private String text = "";
    private int progress = 0;
    private int max = 0;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            shutdown();
            return START_NOT_STICKY;
        }
        if (intent != null) {
            if (intent.hasExtra(EXTRA_TITLE)) title = intent.getStringExtra(EXTRA_TITLE);
            if (intent.hasExtra(EXTRA_TEXT)) text = intent.getStringExtra(EXTRA_TEXT);
            progress = intent.getIntExtra(EXTRA_PROGRESS, progress);
            max = intent.getIntExtra(EXTRA_MAX, max);
        }
        Notification notification = build();
        if (ACTION_UPDATE.equals(action) && foreground) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, notification);
        } else {
            try {
                int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC : 0;
                ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type);
                foreground = true;
            } catch (Exception e) {
                // not allowed to go foreground right now (started from the background):
                // the locks below still help while the app is visible
            }
        }
        holdLocks();
        return START_NOT_STICKY;
    }

    private Notification build() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Импорт и фоновые задачи", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_lane)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(content)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        if (max > 0) b.setProgress(max, Math.min(progress, max), false);
        else b.setProgress(0, 0, true);
        return b.build();
    }

    private void holdLocks() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lane:job");
                wakeLock.setReferenceCounted(false);
            }
            wakeLock.acquire(WAKE_TIMEOUT_MS);
        } catch (Exception ignored) {
        }
        try {
            if (wifiLock == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? WifiManager.WIFI_MODE_FULL_HIGH_PERF
                    : WifiManager.WIFI_MODE_FULL;
                wifiLock = wm.createWifiLock(mode, "lane:job");
                wifiLock.setReferenceCounted(false);
            }
            if (!wifiLock.isHeld()) wifiLock.acquire();
        } catch (Exception ignored) {
        }
    }

    private void shutdown() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        try {
            if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        } catch (Exception ignored) {
        }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        foreground = false;
        stopSelf();
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        // Android 15 caps dataSync services: let go instead of being killed
        shutdown();
    }

    @Override
    public void onDestroy() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        try {
            if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }
}
