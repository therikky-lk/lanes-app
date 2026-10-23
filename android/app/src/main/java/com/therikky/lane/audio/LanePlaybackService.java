package com.therikky.lane.audio;

import android.app.PendingIntent;
import android.content.Intent;

import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import com.therikky.lane.MainActivity;

/**
 * Keeps Lane playing in the background and gives it the media notification,
 * lock screen controls and headset buttons (Media3 builds all of that from the
 * session).
 */
@OptIn(markerClass = UnstableApi.class)
public class LanePlaybackService extends MediaSessionService {

    private MediaSession session;

    @Override
    public void onCreate() {
        super.onCreate();
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent activity = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, PlayerHolder.get(this).sessionPlayer())
            .setSessionActivity(activity)
            .build();
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        // swiped away from recents while paused: nothing left to keep alive
        Player player = session != null ? session.getPlayer() : null;
        if (player == null || !player.getPlayWhenReady() || player.getMediaItemCount() == 0) {
            stopSelf();
        }
    }

    @Override
    public void onDestroy() {
        if (session != null) {
            session.release();
            session = null;
        }
        super.onDestroy();
    }
}
