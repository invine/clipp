package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.service.notification.StatusBarNotification;

import androidx.test.core.app.ActivityScenario;
import androidx.core.content.ContextCompat;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class BackgroundContinuityLifecycleTest {
    private static final String WAKE_LOCK_TAG = "com.clipp.app:BackgroundContinuity";
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
    public void serviceHoldsPartialWakeLockUntilUserStops() throws Exception {
        CountDownLatch started = registerOneShot(BackgroundContinuityService.ACTION_SERVICE_STARTED);
        servicePreferences.edit().putBoolean(BackgroundContinuityService.ENABLED, true).commit();

        ContextCompat.startForegroundService(
            context,
            new Intent(context, BackgroundContinuityService.class)
                .setAction(BackgroundContinuityService.ACTION_START)
        );

        assertTrue(started.await(2, TimeUnit.SECONDS));
        assertTrue(waitForWakeLockState(true));

        CountDownLatch stopped = registerAction("stop");
        context.startService(new Intent(context, BackgroundContinuityService.class).setAction(BackgroundContinuityService.ACTION_STOP));

        assertTrue(stopped.await(2, TimeUnit.SECONDS));
        assertTrue(waitForWakeLockState(false));
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
        assertTrue(waitForWakeLockState(false));
    }

    @Test
    public void removingTheApplicationTaskStopsBackgroundContinuity() throws Exception {
        ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class);
        try {
            CountDownLatch started = registerOneShot(BackgroundContinuityService.ACTION_SERVICE_STARTED);
            CountDownLatch taskRemoved = registerOneShot(BackgroundContinuityService.ACTION_TASK_REMOVED);
            servicePreferences.edit().putBoolean(BackgroundContinuityService.ENABLED, true).commit();
            ContextCompat.startForegroundService(
                context,
                new Intent(context, BackgroundContinuityService.class)
                    .setAction(BackgroundContinuityService.ACTION_START)
            );
            assertTrue(started.await(2, TimeUnit.SECONDS));
            assertNotNull(notification(BackgroundContinuityService.ONGOING_NOTIFICATION_ID));

            activity.onActivity(Activity::finishAndRemoveTask);

            assertTrue(taskRemoved.await(5, TimeUnit.SECONDS));
            assertFalse(servicePreferences.getBoolean(BackgroundContinuityService.SERVICE_ACTIVE, true));
            assertTrue(waitForNotificationRemoval(BackgroundContinuityService.ONGOING_NOTIFICATION_ID));
            assertTrue(waitForWakeLockState(false));
            assertTrue(diagnosticValuePresent("task_removed"));
        } finally {
            activity.close();
        }
    }

    @Test
    public void rebootOffersReconnectWithoutStartingTheService() throws Exception {
        servicePreferences.edit()
            .putBoolean(BackgroundContinuityService.ENABLED, true)
            .putBoolean(BackgroundContinuityService.SERVICE_ACTIVE, false)
            .commit();

        new BackgroundContinuityBootReceiver().onReceive(context, new Intent(Intent.ACTION_BOOT_COMPLETED));

        assertFalse(servicePreferences.getBoolean(BackgroundContinuityService.SERVICE_ACTIVE, false));
        assertNotNull(waitForNotification(BackgroundContinuityService.RECONNECT_NOTIFICATION_ID));
    }

    @Test
    public void blockedNotificationAvailabilityDoesNotCountAsARuntimeFailure() throws Exception {
        int failuresBefore = diagnostics.statusJson().getInt("observedBackgroundFailureCount");

        assertFalse(BackgroundContinuityService.notificationControlsAllow(false, true, true));
        assertFalse(BackgroundContinuityService.notificationControlsAllow(true, false, true));
        assertFalse(BackgroundContinuityService.notificationControlsAllow(true, true, false));
        diagnostics.recordNotificationAvailability(false);

        assertEquals(failuresBefore, diagnostics.statusJson().getInt("observedBackgroundFailureCount"));
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

    private boolean waitForNotificationRemoval(int id) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 2_000L;
        while (notification(id) != null && System.currentTimeMillis() < deadline) {
            Thread.sleep(25L);
        }
        return notification(id) == null;
    }

    private StatusBarNotification waitForNotification(int id) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 2_000L;
        StatusBarNotification posted = notification(id);
        while (posted == null && System.currentTimeMillis() < deadline) {
            Thread.sleep(25L);
            posted = notification(id);
        }
        return posted;
    }

    private boolean waitForWakeLockState(boolean expectedHeld) throws Exception {
        long deadline = System.currentTimeMillis() + 2_000L;
        boolean held = activeWakeLocks(powerDump()).contains(WAKE_LOCK_TAG);
        while (held != expectedHeld && System.currentTimeMillis() < deadline) {
            Thread.sleep(25L);
            held = activeWakeLocks(powerDump()).contains(WAKE_LOCK_TAG);
        }
        return held == expectedHeld;
    }

    private String activeWakeLocks(String powerDump) {
        int start = powerDump.indexOf("Wake Locks: size=");
        if (start < 0) return "";
        int end = powerDump.indexOf("\nSuspend Blockers:", start);
        return end < 0 ? powerDump.substring(start) : powerDump.substring(start, end);
    }

    private String powerDump() throws IOException {
        ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation()
            .getUiAutomation()
            .executeShellCommand("dumpsys power");
        try (
            ParcelFileDescriptor.AutoCloseInputStream input = new ParcelFileDescriptor.AutoCloseInputStream(descriptor);
            ByteArrayOutputStream output = new ByteArrayOutputStream()
        ) {
            byte[] buffer = new byte[4_096];
            int read;
            while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private boolean diagnosticValuePresent(String expected) throws Exception {
        org.json.JSONArray events = new org.json.JSONObject(diagnostics.exportJson()).getJSONArray("events");
        for (int index = 0; index < events.length(); index += 1) {
            if (expected.equals(events.getJSONObject(index).optString("value"))) return true;
        }
        return false;
    }

    private void grantNotifications() {
        if (Build.VERSION.SDK_INT < 33) return;
        InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(
            context.getPackageName(),
            Manifest.permission.POST_NOTIFICATIONS
        );
    }

}
