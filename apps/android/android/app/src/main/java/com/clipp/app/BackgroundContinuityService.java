package com.clipp.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * A process-lifetime companion for the Activity-owned WebView runtime. It owns
 * no Clipp identity, network node, history, or clipboard access.
 */
public final class BackgroundContinuityService extends Service {
    private enum ConnectionState {
        CONNECTED("connected"),
        WAITING("waiting"),
        RECONNECTING("reconnecting"),
        PAUSED("paused"),
        DISCONNECTED("disconnected");

        private final String wireValue;

        ConnectionState(String wireValue) {
            this.wireValue = wireValue;
        }

        static ConnectionState fromWire(String wireValue) {
            for (ConnectionState state : values()) {
                if (state.wireValue.equals(wireValue)) return state;
            }
            return WAITING;
        }

        String notificationText(int connectedCount) {
            switch (this) {
                case CONNECTED:
                    return "Connected to " + connectedCount + " trusted device" + (connectedCount == 1 ? "" : "s");
                case RECONNECTING:
                    return "Reconnecting to trusted devices";
                case PAUSED:
                    return "Auto Sync is paused";
                case DISCONNECTED:
                    return "Disconnected";
                case WAITING:
                default:
                    return "Waiting for trusted devices";
            }
        }
    }

    public static final String ACTION_START = "com.clipp.app.background.START";
    public static final String ACTION_STOP = "com.clipp.app.background.STOP";
    public static final String ACTION_HEARTBEAT = "com.clipp.app.background.HEARTBEAT";
    public static final String ACTION_UPDATE = "com.clipp.app.background.UPDATE";
    public static final String ACTION_PAUSE = "com.clipp.app.background.PAUSE";
    public static final String ACTION_RESUME = "com.clipp.app.background.RESUME";
    public static final String ACTION_RUNTIME_LOST = "com.clipp.app.background.RUNTIME_LOST";
    public static final String ACTION_TASK_REMOVED = "com.clipp.app.background.TASK_REMOVED";
    public static final String ACTION_NOTIFICATION_ACTION = "com.clipp.app.background.NOTIFICATION_ACTION";
    public static final String ACTION_SERVICE_STARTED = "com.clipp.app.background.SERVICE_STARTED";
    public static final String EXTRA_CONNECTION_STATE = "connectionState";
    public static final String EXTRA_CONNECTED_DEVICE_COUNT = "connectedTrustedDeviceCount";
    public static final String EXTRA_ACTION = "action";
    static final String EXTRA_HEARTBEAT_TIMEOUT_MS = "heartbeatTimeoutMs";
    static final String EXTRA_HEARTBEAT_CHECK_MS = "heartbeatCheckMs";

    static final String PREFERENCES = "clipp_background_continuity";
    static final String ENABLED = "enabled";
    static final String USER_STOPPED = "userStopped";
    static final String SERVICE_ACTIVE = "serviceActive";
    private static final String CHANNEL_ID = "clipp_background_continuity";
    static final int ONGOING_NOTIFICATION_ID = 4101;
    static final int RECONNECT_NOTIFICATION_ID = 4102;
    private static final long DEFAULT_HEARTBEAT_TIMEOUT_MS = 60_000L;
    private static final long DEFAULT_HEARTBEAT_CHECK_MS = 5_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long lastHeartbeatElapsedMs;
    private long heartbeatTimeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS;
    private long heartbeatCheckMs = DEFAULT_HEARTBEAT_CHECK_MS;
    private boolean heartbeatHealthy;
    private ConnectionState connectionState = ConnectionState.WAITING;
    private int connectedTrustedDeviceCount = 0;
    private BackgroundContinuityDiagnostics diagnostics;

    private final Runnable heartbeatWatchdog = new Runnable() {
        @Override
        public void run() {
            if (SystemClock.elapsedRealtime() - lastHeartbeatElapsedMs >= heartbeatTimeoutMs) {
                connectionState = ConnectionState.DISCONNECTED;
                diagnostics.recordHeartbeatTransition("expired");
                diagnostics.recordConnectionTransition("disconnected", 0);
                diagnostics.recordObservedFailure("heartbeat_expired");
                diagnostics.recordServiceTransition("stopped_runtime_lost");
                preferences(BackgroundContinuityService.this).edit().putBoolean(SERVICE_ACTIVE, false).apply();
                notifyRuntimeLost();
                postReconnectNotification(BackgroundContinuityService.this);
                stopForeground(STOP_FOREGROUND_REMOVE);
                stopSelf();
                return;
            }
            handler.postDelayed(this, heartbeatCheckMs);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        diagnostics = new BackgroundContinuityDiagnostics(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            diagnostics.recordLifecycleTransition("notification_stop");
            diagnostics.recordServiceTransition("stopped_by_user");
            preferences(this).edit()
                .putBoolean(ENABLED, false)
                .putBoolean(USER_STOPPED, true)
                .putBoolean(SERVICE_ACTIVE, false)
                .apply();
            notifyAction("stop");
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        boolean starting = ACTION_START.equals(action);
        if (starting && !preferences(this).getBoolean(ENABLED, false)) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        if (!starting && !preferences(this).getBoolean(SERVICE_ACTIVE, false)) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        if (starting) {
            if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                heartbeatTimeoutMs = Math.max(10L, intent.getLongExtra(EXTRA_HEARTBEAT_TIMEOUT_MS, DEFAULT_HEARTBEAT_TIMEOUT_MS));
                heartbeatCheckMs = Math.max(10L, intent.getLongExtra(EXTRA_HEARTBEAT_CHECK_MS, DEFAULT_HEARTBEAT_CHECK_MS));
            }
            preferences(this).edit().putBoolean(SERVICE_ACTIVE, true).apply();
            diagnostics.recordServiceTransition("running");
            diagnostics.recordHeartbeatTransition("awaiting");
            diagnostics.recordEnvironmentSnapshot();
            heartbeatHealthy = false;
        }
        if (ACTION_PAUSE.equals(action) || ACTION_RESUME.equals(action)) {
            connectionState = ACTION_PAUSE.equals(action) ? ConnectionState.PAUSED : ConnectionState.WAITING;
            diagnostics.recordLifecycleTransition(ACTION_PAUSE.equals(action) ? "notification_pause" : "notification_resume");
            notifyAction(ACTION_PAUSE.equals(action) ? "pause" : "resume");
        }
        if (ACTION_UPDATE.equals(action)) {
            connectionState = ConnectionState.fromWire(intent.getStringExtra(EXTRA_CONNECTION_STATE));
            connectedTrustedDeviceCount = Math.max(0, intent.getIntExtra(EXTRA_CONNECTED_DEVICE_COUNT, 0));
        }
        if (starting || ACTION_HEARTBEAT.equals(action)) {
            lastHeartbeatElapsedMs = SystemClock.elapsedRealtime();
            if (ACTION_HEARTBEAT.equals(action) && !heartbeatHealthy) {
                heartbeatHealthy = true;
                diagnostics.recordHeartbeatTransition("healthy");
            }
        }
        diagnostics.recordConnectionTransition(connectionState.wireValue, connectedTrustedDeviceCount);
        createNotificationChannel(this);
        startForegroundSafely();
        if (starting) notifyServiceStarted();
        handler.removeCallbacks(heartbeatWatchdog);
        handler.postDelayed(heartbeatWatchdog, heartbeatCheckMs);
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        diagnostics.recordLifecycleTransition("task_removed");
        diagnostics.recordServiceTransition("stopped_task_removed");
        preferences(this).edit().putBoolean(SERVICE_ACTIVE, false).apply();
        handler.removeCallbacks(heartbeatWatchdog);
        sendBroadcast(new Intent(ACTION_TASK_REMOVED).setPackage(getPackageName()));
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        preferences(this).edit().putBoolean(SERVICE_ACTIVE, false).apply();
        handler.removeCallbacks(heartbeatWatchdog);
        if (diagnostics != null) diagnostics.recordServiceTransition("destroyed");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startForegroundSafely() {
        Notification notification = buildOngoingNotification(this, connectionState, connectedTrustedDeviceCount);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(ONGOING_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);
        } else {
            startForeground(ONGOING_NOTIFICATION_ID, notification);
        }
    }

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Clipp background continuity",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Experimental background connectivity status for Clipp.");
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }

    private static Notification buildOngoingNotification(Context context, ConnectionState state, int connectedCount) {
        return new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Clipp background continuity")
            .setContentText(state.notificationText(connectedCount))
            .setContentIntent(openAppIntent(context))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(0, "Pause", serviceIntent(context, ACTION_PAUSE, 11))
            .addAction(0, "Resume", serviceIntent(context, ACTION_RESUME, 12))
            .addAction(0, "Stop", serviceIntent(context, ACTION_STOP, 13))
            .build();
    }

    static void postReconnectNotification(Context context) {
        boolean granted = notificationsGranted(context);
        new BackgroundContinuityDiagnostics(context).recordNotificationPermission(granted);
        if (!granted) return;
        createNotificationChannel(context);
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Tap to reconnect Clipp")
            .setContentText("Open Clipp to resume experimental background continuity.")
            .setContentIntent(openAppIntent(context))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build();
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).notify(RECONNECT_NOTIFICATION_ID, notification);
    }

    static boolean notificationsGranted(Context context) {
        return Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private static PendingIntent openAppIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 10, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent serviceIntent(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, BackgroundContinuityService.class).setAction(action);
        return PendingIntent.getService(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void notifyRuntimeLost() {
        Intent event = new Intent(ACTION_RUNTIME_LOST).setPackage(getPackageName());
        sendBroadcast(event);
    }

    private void notifyServiceStarted() {
        sendBroadcast(new Intent(ACTION_SERVICE_STARTED).setPackage(getPackageName()));
    }

    private void notifyAction(String action) {
        Intent event = new Intent(ACTION_NOTIFICATION_ACTION).setPackage(getPackageName());
        event.putExtra(EXTRA_ACTION, action);
        sendBroadcast(event);
    }
}
