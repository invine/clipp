package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import androidx.core.content.ContextCompat;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 36)
public final class BackgroundContinuityLifecycleTest {
    private Context context;
    private SharedPreferences servicePreferences;
    private NotificationManager notifications;
    private BackgroundContinuityDiagnostics diagnostics;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        servicePreferences = BackgroundContinuityService.preferences(context);
        servicePreferences.edit().clear().commit();
        context.getSharedPreferences(ClipContinuityPreferences.NAME, Context.MODE_PRIVATE).edit().clear().commit();
        notifications = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        notifications.cancelAll();
        diagnostics = new BackgroundContinuityDiagnostics(context);
        diagnostics.clearForTesting();
        grantNotifications();
    }

    @After
    public void tearDown() {
        context.stopService(new Intent(context, BackgroundContinuityService.class));
        servicePreferences.edit().clear().commit();
        context.getSharedPreferences(ClipContinuityPreferences.NAME, Context.MODE_PRIVATE).edit().clear().commit();
        notifications.cancelAll();
        diagnostics.clearForTesting();
    }

    @Test
    public void serviceStartupPublishesPrivacySafeStatusAndNotificationActions() throws Exception {
        CountDownLatch started = registerOneShot(BackgroundContinuityService.ACTION_SERVICE_STARTED);
        servicePreferences.edit().putBoolean(BackgroundContinuityService.ENABLED, true).commit();

        ContextCompat.startForegroundService(
            context,
            new Intent(context, BackgroundContinuityService.class)
                .setAction(BackgroundContinuityService.ACTION_START)
        );

        assertTrue(started.await(2, TimeUnit.SECONDS));
        assertTrue(servicePreferences.getBoolean(BackgroundContinuityService.SERVICE_ACTIVE, false));
        StatusBarNotification ongoing = notification(BackgroundContinuityService.ONGOING_NOTIFICATION_ID);
        assertNotNull(ongoing);
        Notification value = ongoing.getNotification();
        assertEquals("Clipp background continuity", value.extras.getString(Notification.EXTRA_TITLE));
        assertEquals("Waiting for trusted devices", value.extras.getString(Notification.EXTRA_TEXT));
        assertEquals(
            Arrays.asList("Pause", "Resume", "Stop"),
            Arrays.asList(
                value.actions[0].title.toString(),
                value.actions[1].title.toString(),
                value.actions[2].title.toString()
            )
        );
    }

    @Test
    public void pauseResumeAndStopRemainUserControlledBoundaries() throws Exception {
        servicePreferences.edit()
            .putBoolean(BackgroundContinuityService.ENABLED, true)
            .putBoolean(BackgroundContinuityService.SERVICE_ACTIVE, true)
            .commit();

        CountDownLatch paused = registerAction("pause");
        context.startService(new Intent(context, BackgroundContinuityService.class).setAction(BackgroundContinuityService.ACTION_PAUSE));
        assertTrue(paused.await(2, TimeUnit.SECONDS));

        CountDownLatch resumed = registerAction("resume");
        context.startService(new Intent(context, BackgroundContinuityService.class).setAction(BackgroundContinuityService.ACTION_RESUME));
        assertTrue(resumed.await(2, TimeUnit.SECONDS));

        CountDownLatch stopped = registerAction("stop");
        context.startService(new Intent(context, BackgroundContinuityService.class).setAction(BackgroundContinuityService.ACTION_STOP));
        assertTrue(stopped.await(2, TimeUnit.SECONDS));
        assertFalse(servicePreferences.getBoolean(BackgroundContinuityService.ENABLED, true));
        assertTrue(servicePreferences.getBoolean(BackgroundContinuityService.USER_STOPPED, false));
    }

    @Test
    public void heartbeatLossStopsTheEmptyServiceAndRecordsAnObservedFailure() throws Exception {
        CountDownLatch runtimeLost = registerOneShot(BackgroundContinuityService.ACTION_RUNTIME_LOST);
        servicePreferences.edit().putBoolean(BackgroundContinuityService.ENABLED, true).commit();

        ContextCompat.startForegroundService(
            context,
            new Intent(context, BackgroundContinuityService.class)
                .setAction(BackgroundContinuityService.ACTION_START)
                .putExtra(BackgroundContinuityService.EXTRA_HEARTBEAT_TIMEOUT_MS, 60L)
                .putExtra(BackgroundContinuityService.EXTRA_HEARTBEAT_CHECK_MS, 20L)
        );

        assertTrue(runtimeLost.await(2, TimeUnit.SECONDS));
        assertFalse(servicePreferences.getBoolean(BackgroundContinuityService.SERVICE_ACTIVE, true));
        assertEquals(1, diagnostics.statusJson().getInt("observedBackgroundFailureCount"));
    }

    @Test
    public void rebootOffersReconnectWithoutStartingTheService() {
        servicePreferences.edit()
            .putBoolean(BackgroundContinuityService.ENABLED, true)
            .putBoolean(BackgroundContinuityService.SERVICE_ACTIVE, false)
            .commit();

        new BackgroundContinuityBootReceiver().onReceive(context, new Intent(Intent.ACTION_BOOT_COMPLETED));

        assertFalse(servicePreferences.getBoolean(BackgroundContinuityService.SERVICE_ACTIVE, false));
        assertNotNull(notification(BackgroundContinuityService.RECONNECT_NOTIFICATION_ID));
    }

    @Test
    public void reconnectNotificationDegradesWithoutBlockingWhenPermissionIsDenied() {
        BackgroundContinuityService.postReconnectNotification(context);
        assertNotNull(notification(BackgroundContinuityService.RECONNECT_NOTIFICATION_ID));
        notifications.cancelAll();

        revokeNotifications();
        BackgroundContinuityService.postReconnectNotification(context);

        assertNull(notification(BackgroundContinuityService.RECONNECT_NOTIFICATION_ID));
    }

    @Test
    public void ingressAndPendingApplicationDiagnosticsNeverContainTheirPayloadsOrIdentifiers() throws Exception {
        String rawText = "diagnostic-secret-share-text";
        String clipId = "00000000-0000-4000-8000-000000000999";
        ExplicitTextIngressStore ingress = new ExplicitTextIngressStore(context);
        PendingClipboardApplicationStore pending = new PendingClipboardApplicationStore(context);

        assertEquals(
            ExplicitTextIngressStore.EnqueueResult.QUEUED,
            ingress.enqueue(
                new Intent(Intent.ACTION_SEND)
                    .setType("text/plain")
                    .putExtra(Intent.EXTRA_TEXT, rawText)
            )
        );
        assertTrue(pending.write(clipId));

        String exported = diagnostics.exportJson();
        assertFalse(exported.contains(rawText));
        assertFalse(exported.contains(clipId));
        assertTrue(exported.contains("pending_action_count"));
        assertTrue(exported.contains("pending_application_presence"));
    }

    private CountDownLatch registerOneShot(String action) {
        CountDownLatch latch = new CountDownLatch(1);
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ignored, Intent intent) {
                latch.countDown();
                context.unregisterReceiver(this);
            }
        };
        ContextCompat.registerReceiver(
            context,
            receiver,
            new IntentFilter(action),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
        return latch;
    }

    private CountDownLatch registerAction(String expected) {
        CountDownLatch latch = new CountDownLatch(1);
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ignored, Intent intent) {
                if (!expected.equals(intent.getStringExtra(BackgroundContinuityService.EXTRA_ACTION))) return;
                latch.countDown();
                context.unregisterReceiver(this);
            }
        };
        ContextCompat.registerReceiver(
            context,
            receiver,
            new IntentFilter(BackgroundContinuityService.ACTION_NOTIFICATION_ACTION),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
        return latch;
    }

    private StatusBarNotification notification(int id) {
        return Arrays.stream(notifications.getActiveNotifications())
            .filter(candidate -> candidate.getId() == id)
            .findFirst()
            .orElse(null);
    }

    private void grantNotifications() {
        if (Build.VERSION.SDK_INT < 33) return;
        InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(
            context.getPackageName(),
            Manifest.permission.POST_NOTIFICATIONS
        );
    }

    private void revokeNotifications() {
        if (Build.VERSION.SDK_INT < 33) return;
        InstrumentationRegistry.getInstrumentation().getUiAutomation().revokeRuntimePermission(
            context.getPackageName(),
            Manifest.permission.POST_NOTIFICATIONS
        );
    }
}
