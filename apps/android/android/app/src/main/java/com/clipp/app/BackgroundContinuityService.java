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
import android.os.PowerManager;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * A process-lifetime companion for the Activity-owned WebView runtime. It owns
 * no Clipp identity, network node, history, or clipboard access.
 */
public final class BackgroundContinuityService extends Service {
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
    private static final String WAKE_LOCK_TAG = "com.clipp.app:BackgroundContinuity";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long lastHeartbeatElapsedMs;
    private long heartbeatTimeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS;
    private long heartbeatCheckMs = DEFAULT_HEARTBEAT_CHECK_MS;
    private boolean heartbeatHealthy;
    private BackgroundContinuityConnectionState connectionState = BackgroundContinuityConnectionState.WAITING;
    private int connectedTrustedDeviceCount = 0;
    private BackgroundContinuityDiagnostics diagnostics;
    private PowerManager.WakeLock wakeLock;

    private final Runnable heartbeatWatchdog = new Runnable() {
        @Override
        public void run() {
            if (SystemClock.elapsedRealtime() - lastHeartbeatElapsedMs >= heartbeatTimeoutMs) {
                connectionState = BackgroundContinuityConnectionState.DISCONNECTED;
                diagnostics.recordHeartbeatTransition(BackgroundContinuityDiagnostics.HeartbeatTransition.EXPIRED);
                diagnostics.recordConnectionTransition(BackgroundContinuityConnectionState.DISCONNECTED, 0);
                diagnostics.recordObservedFailure(BackgroundContinuityDiagnostics.FailureReason.HEARTBEAT_EXPIRED);
                diagnostics.recordServiceTransition(BackgroundContinuityDiagnostics.ServiceTransition.STOPPED_RUNTIME_LOST);
                preferences(BackgroundContinuityService.this).edit().putBoolean(SERVICE_ACTIVE, false).apply();
                notifyRuntimeLost();
                postReconnectNotification(BackgroundContinuityService.this);
                releaseWakeLock();
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
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG);
            wakeLock.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            diagnostics.recordLifecycleTransition(BackgroundContinuityDiagnostics.LifecycleTransition.NOTIFICATION_STOP);
            diagnostics.recordServiceTransition(BackgroundContinuityDiagnostics.ServiceTransition.STOPPED_BY_USER);
            preferences(this).edit()
                .putBoolean(ENABLED, false)
                .putBoolean(USER_STOPPED, true)
                .putBoolean(SERVICE_ACTIVE, false)
                .apply();
            notifyAction("stop");
            releaseWakeLock();
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
            releaseWakeLock();
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        if (starting) {
            if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                heartbeatTimeoutMs = Math.max(10L, intent.getLongExtra(EXTRA_HEARTBEAT_TIMEOUT_MS, DEFAULT_HEARTBEAT_TIMEOUT_MS));
                heartbeatCheckMs = Math.max(10L, intent.getLongExtra(EXTRA_HEARTBEAT_CHECK_MS, DEFAULT_HEARTBEAT_CHECK_MS));
            }
            preferences(this).edit().putBoolean(SERVICE_ACTIVE, true).apply();
            diagnostics.recordServiceTransition(BackgroundContinuityDiagnostics.ServiceTransition.RUNNING);
            diagnostics.recordHeartbeatTransition(BackgroundContinuityDiagnostics.HeartbeatTransition.AWAITING);
            diagnostics.recordEnvironmentSnapshot();
            heartbeatHealthy = false;
        }
        if (ACTION_PAUSE.equals(action) || ACTION_RESUME.equals(action)) {
            connectionState = ACTION_PAUSE.equals(action)
                ? BackgroundContinuityConnectionState.PAUSED
                : BackgroundContinuityConnectionState.WAITING;
            diagnostics.recordLifecycleTransition(
                ACTION_PAUSE.equals(action)
                    ? BackgroundContinuityDiagnostics.LifecycleTransition.NOTIFICATION_PAUSE
                    : BackgroundContinuityDiagnostics.LifecycleTransition.NOTIFICATION_RESUME
            );
            notifyAction(ACTION_PAUSE.equals(action) ? "pause" : "resume");
        }
        if (ACTION_UPDATE.equals(action)) {
            connectionState = BackgroundContinuityConnectionState.fromWire(
                intent.getStringExtra(EXTRA_CONNECTION_STATE)
            );
            connectedTrustedDeviceCount = Math.max(0, intent.getIntExtra(EXTRA_CONNECTED_DEVICE_COUNT, 0));
        }
        if (starting || ACTION_HEARTBEAT.equals(action)) {
            lastHeartbeatElapsedMs = SystemClock.elapsedRealtime();
            if (ACTION_HEARTBEAT.equals(action) && !heartbeatHealthy) {
                heartbeatHealthy = true;
                diagnostics.recordHeartbeatTransition(BackgroundContinuityDiagnostics.HeartbeatTransition.HEALTHY);
            }
        }
        diagnostics.recordConnectionTransition(connectionState, connectedTrustedDeviceCount);
        createNotificationChannel(this);
        startForegroundSafely();
        acquireWakeLock();
        if (starting) notifyServiceStarted();
        handler.removeCallbacks(heartbeatWatchdog);
        handler.postDelayed(heartbeatWatchdog, heartbeatCheckMs);
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        diagnostics.recordLifecycleTransition(BackgroundContinuityDiagnostics.LifecycleTransition.TASK_REMOVED);
        diagnostics.recordServiceTransition(BackgroundContinuityDiagnostics.ServiceTransition.STOPPED_TASK_REMOVED);
        preferences(this).edit().putBoolean(SERVICE_ACTIVE, false).apply();
        handler.removeCallbacks(heartbeatWatchdog);
        sendBroadcast(new Intent(ACTION_TASK_REMOVED).setPackage(getPackageName()));
        releaseWakeLock();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        preferences(this).edit().putBoolean(SERVICE_ACTIVE, false).apply();
        handler.removeCallbacks(heartbeatWatchdog);
        releaseWakeLock();
        if (diagnostics != null) {
            diagnostics.recordServiceTransition(BackgroundContinuityDiagnostics.ServiceTransition.DESTROYED);
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startForegroundSafely() {
        Notification notification = buildOngoingNotification(this, connectionState, connectedTrustedDeviceCount);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(ONGOING_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);
        } else {
            startForeground(ONGOING_NOTIFICATION_ID, notification);
        }
    }

    private void acquireWakeLock() {
        if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
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

    private static Notification buildOngoingNotification(
        Context context,
        BackgroundContinuityConnectionState state,
        int connectedCount
    ) {
        return new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Clipp background continuity")
            .setContentText(notificationText(state, connectedCount))
            .setContentIntent(openAppIntent(context))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(0, "Pause", serviceIntent(context, ACTION_PAUSE, 11))
            .addAction(0, "Resume", serviceIntent(context, ACTION_RESUME, 12))
            .addAction(0, "Stop", serviceIntent(context, ACTION_STOP, 13))
            .build();
    }

    private static String notificationText(BackgroundContinuityConnectionState state, int connectedCount) {
        switch (state) {
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

    static void postReconnectNotification(Context context) {
        boolean available = notificationsAvailable(context);
        new BackgroundContinuityDiagnostics(context).recordNotificationAvailability(available);
        if (!available) return;
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

    static boolean notificationsAvailable(Context context) {
        boolean runtimePermissionGranted = !(
            Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        );
        boolean applicationNotificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return notificationControlsAllow(runtimePermissionGranted, applicationNotificationsEnabled, true);
        }
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = manager == null ? null : manager.getNotificationChannel(CHANNEL_ID);
        boolean channelEnabled = channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        return notificationControlsAllow(runtimePermissionGranted, applicationNotificationsEnabled, channelEnabled);
    }

    static boolean notificationControlsAllow(
        boolean runtimePermissionGranted,
        boolean applicationNotificationsEnabled,
        boolean channelEnabled
    ) {
        return runtimePermissionGranted && applicationNotificationsEnabled && channelEnabled;
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
