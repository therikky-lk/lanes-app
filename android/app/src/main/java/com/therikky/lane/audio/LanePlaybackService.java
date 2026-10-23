package com.therikky.lane.audio;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.CommandButton;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionCommands;
import androidx.media3.session.SessionResult;

import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import com.therikky.lane.MainActivity;
import com.therikky.lane.R;

/**
 * Keeps Lane playing in the background and gives it the media notification,
 * lock screen controls and headset buttons (Media3 builds all of that from the
 * session). The notification also carries a like button.
 */
@OptIn(markerClass = UnstableApi.class)
public class LanePlaybackService extends MediaSessionService {

    private static final SessionCommand LIKE = new SessionCommand("lane.like", Bundle.EMPTY);
    private static final SessionCommand REPEAT = new SessionCommand("lane.repeat", Bundle.EMPTY);

    private MediaSession session;

    @Override
    public void onCreate() {
        super.onCreate();
        DefaultMediaNotificationProvider notifications = new DefaultMediaNotificationProvider.Builder(this).build();
        notifications.setSmallIcon(R.drawable.ic_stat_lane);
        setMediaNotificationProvider(notifications);

        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent activity = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PlayerHolder holder = PlayerHolder.get(this);
        session = new MediaSession.Builder(this, holder.sessionPlayer())
            .setSessionActivity(activity)
            .setCallback(new Callback())
            .setMediaButtonPreferences(buttons(holder))
            .build();
        Runnable refresh = () -> {
            if (session != null) session.setMediaButtonPreferences(buttons(holder));
        };
        holder.setLikedListener(refresh);
        holder.setRepeatListener(refresh);
    }

    private static ImmutableList<CommandButton> buttons(PlayerHolder holder) {
        boolean liked = holder.isLiked();
        int repeat = holder.getRepeatMode();
        CommandButton repeatButton = new CommandButton.Builder(
                repeat == 2 ? CommandButton.ICON_REPEAT_ONE : repeat == 1 ? CommandButton.ICON_REPEAT_ALL : CommandButton.ICON_REPEAT_OFF)
            .setDisplayName(repeat == 2 ? "Repeat one" : repeat == 1 ? "Repeat all" : "Repeat off")
            .setSessionCommand(REPEAT)
            .setSlots(CommandButton.SLOT_OVERFLOW)
            .build();

        CommandButton like = new CommandButton.Builder(
                liked ? CommandButton.ICON_HEART_FILLED : CommandButton.ICON_HEART_UNFILLED)
            .setDisplayName(liked ? "Remove from Liked" : "Like")
            .setSessionCommand(LIKE)
            .setSlots(CommandButton.SLOT_OVERFLOW)
            .build();
        return ImmutableList.of(repeatButton, like);
    }

    private final class Callback implements MediaSession.Callback {
        @NonNull
        @Override
        public MediaSession.ConnectionResult onConnect(@NonNull MediaSession session, @NonNull MediaSession.ControllerInfo controller) {
            SessionCommands commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon().add(LIKE).add(REPEAT).build();
            return new MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(commands)
                .build();
        }

        @NonNull
        @Override
        public ListenableFuture<SessionResult> onCustomCommand(@NonNull MediaSession session, @NonNull MediaSession.ControllerInfo controller,
                                                               @NonNull SessionCommand command, @NonNull Bundle args) {
            if (LIKE.customAction.equals(command.customAction)) {
                PlayerHolder holder = PlayerHolder.get(LanePlaybackService.this);
                // flip right away so the button reacts; the app confirms via setLiked
                holder.setLiked(!holder.isLiked());
                holder.remote("like");
                return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
            }
            if (REPEAT.customAction.equals(command.customAction)) {
                PlayerHolder holder = PlayerHolder.get(LanePlaybackService.this);
                holder.setRepeatMode((holder.getRepeatMode() + 1) % 3);
                holder.remote("repeat");
                return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
            }
            return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED));
        }
    }

    @Nullable
    @Override
    public MediaSession onGetSession(@NonNull MediaSession.ControllerInfo controllerInfo) {
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
        PlayerHolder.get(this).setLikedListener(null);
        PlayerHolder.get(this).setRepeatListener(null);
        if (session != null) {
            session.release();
            session = null;
        }
        super.onDestroy();
    }
}
