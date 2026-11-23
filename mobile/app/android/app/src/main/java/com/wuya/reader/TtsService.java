package com.wuya.reader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;

public class TtsService extends Service {

    private static final String CHANNEL_ID = "wuya-tts";
    private static final int NOTIFICATION_ID = 4211;

    private static final String ACTION_PLAY = "com.wuya.reader.tts.PLAY";
    private static final String ACTION_PAUSE = "com.wuya.reader.tts.PAUSE";
    private static final String ACTION_NEXT = "com.wuya.reader.tts.NEXT";
    private static final String ACTION_PREV = "com.wuya.reader.tts.PREV";
    private static final String ACTION_STOP = "com.wuya.reader.tts.STOP";

    private MediaSession session;
    private String title = "无涯";
    private boolean playing = true;
    private boolean hasPrev = false;
    private boolean hasNext = true;

    public static void start(Context context, String title, boolean playing, boolean hasPrev, boolean hasNext) {
        Intent intent = new Intent(context, TtsService.class);
        intent.setAction("com.wuya.reader.tts.START");
        intent.putExtra("title", title);
        intent.putExtra("playing", playing);
        intent.putExtra("hasPrev", hasPrev);
        intent.putExtra("hasNext", hasNext);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
        else context.startService(intent);
    }

    public static void update(Context context, String title, boolean playing, boolean hasPrev, boolean hasNext) {
        Intent intent = new Intent(context, TtsService.class);
        intent.setAction("com.wuya.reader.tts.UPDATE");
        intent.putExtra("title", title);
        intent.putExtra("playing", playing);
        intent.putExtra("hasPrev", hasPrev);
        intent.putExtra("hasNext", hasNext);
        context.startService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        session = new MediaSession(this, "WuyaTts");
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                TtsPlugin.dispatchMedia("play");
                playing = true;
                refresh();
            }

            @Override
            public void onPause() {
                TtsPlugin.dispatchMedia("pause");
                playing = false;
                refresh();
            }

            @Override
            public void onSkipToNext() {
                TtsPlugin.dispatchMedia("next");
            }

            @Override
            public void onSkipToPrevious() {
                TtsPlugin.dispatchMedia("prev");
            }

            @Override
            public void onStop() {
                TtsPlugin.dispatchMedia("stop");
                stopSelf();
            }
        });
        session.setActive(true);
        updatePlaybackState();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "朗读", NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private PendingIntent actionIntent(String action) {
        Intent intent = new Intent(this, TtsService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, action.hashCode(), intent, flags);
    }

    private Notification build() {
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        builder.setContentTitle(title)
                .setContentText(playing ? "正在朗读" : "朗读已暂停")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(playing)
                .setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC);

        builder.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_previous, "上一句", actionIntent(ACTION_PREV)).build());
        builder.addAction(new Notification.Action.Builder(
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "暂停" : "继续",
                actionIntent(playing ? ACTION_PAUSE : ACTION_PLAY)).build());
        builder.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_next, "下一句", actionIntent(ACTION_NEXT)).build());

        Intent open = new Intent(this, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        builder.setContentIntent(PendingIntent.getActivity(this, 0, open, flags));

        if (Build.VERSION.SDK_INT >= 21) {
            builder.setStyle(new Notification.MediaStyle()
                    .setMediaSession(session == null ? null : session.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2));
        }
        return builder.build();
    }

    private void updatePlaybackState() {
        if (session == null) return;
        PlaybackState.Builder state = new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY
                        | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT
                        | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                        | PlaybackState.ACTION_STOP);
        state.setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                playing ? PlaybackState.PLAYBACK_POSITION_UNKNOWN : 0, 1f);
        session.setPlaybackState(state.build());
        session.setMetadata(new android.media.MediaMetadata.Builder()
                .putString(android.media.MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(android.media.MediaMetadata.METADATA_KEY_ARTIST, "无涯")
                .build());
    }

    private void refresh() {
        updatePlaybackState();
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, build());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_PLAY.equals(action)) {
                TtsPlugin.dispatchMedia("play");
                playing = true;
            } else if (ACTION_PAUSE.equals(action)) {
                TtsPlugin.dispatchMedia("pause");
                playing = false;
            } else if (ACTION_NEXT.equals(action)) {
                TtsPlugin.dispatchMedia("next");
            } else if (ACTION_PREV.equals(action)) {
                TtsPlugin.dispatchMedia("prev");
            } else if (ACTION_STOP.equals(action)) {
                TtsPlugin.dispatchMedia("stop");
                stopSelf();
                return START_NOT_STICKY;
            } else {
                String nextTitle = intent.getStringExtra("title");
                if (nextTitle != null) title = nextTitle;
                playing = intent.getBooleanExtra("playing", playing);
                hasPrev = intent.getBooleanExtra("hasPrev", hasPrev);
                hasNext = intent.getBooleanExtra("hasNext", hasNext);
            }
        }
        startForeground(NOTIFICATION_ID, build());
        refresh();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        super.onDestroy();
    }
}
