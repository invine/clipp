package com.clipp.app;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

import android.content.Context;
import android.content.Intent;
import android.os.Process;
import android.os.SystemClock;
import android.app.NotificationManager;
import android.service.notification.StatusBarNotification;
import android.system.Os;
import java.io.File;
import java.util.concurrent.atomic.AtomicReference;
import com.getcapacitor.Plugin;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Production native queues and admission; separate from core/WebView finalization qualification. */
@RunWith(AndroidJUnit4.class)
public final class NativeIdentityResetRuntimeTest {
    private Context context;
    private IdentityResetPersistence persistence;
    private NativeIdentityResetFence fence;
    private static final String PREFIX = NativeIdentityResetFence.PREFIX;
    private static final String PID = PREFIX + "runtime-proof-pid";
    private static final String CHECKPOINT = PREFIX + "runtime-proof-checkpoint";

    @Before public void requireIsolatedTarget() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NativeAcceptanceTarget.requireIsolated(context.getPackageName());
        persistence = IdentityResetPersistence.forContext(context);
        fence = NativeIdentityResetFence.forContext(context);
    }

    private Intent text(String action) {
        return new Intent(action).setType("text/plain")
            .putExtra(Intent.ACTION_SEND.equals(action) ? Intent.EXTRA_TEXT : Intent.EXTRA_PROCESS_TEXT, "synthetic-reset-native-text");
    }

    private void seed() {
        for (String key : new String[] {"manualIdentityReset", "manualIdentityResetReceipt", "manualIdentityResetCompleted", "nativeIdentityResetFence"})
            persistence.remove(PREFIX + key);
        assertTrue(context.getSharedPreferences(ClipContinuityPreferences.NAME, Context.MODE_PRIVATE).edit().clear().commit());
        assertTrue(BackgroundContinuityService.preferences(context).edit()
            .putBoolean(BackgroundContinuityService.ENABLED, true)
            .putBoolean(BackgroundContinuityService.USER_STOPPED, false).commit());
        persistence.set(PREFIX + "autoSyncEnabled", "false");
        assertEquals(ExplicitTextIngressStore.EnqueueResult.QUEUED, new ExplicitTextIngressStore(context).enqueue(text(Intent.ACTION_SEND)));
        assertEquals(ExplicitTextIngressStore.EnqueueResult.QUEUED, new ExplicitTextIngressStore(context).enqueue(text(Intent.ACTION_PROCESS_TEXT)));
        assertTrue(new PendingClipboardApplicationStore(context).write("synthetic-former-remote-clip"));
    }

    private void preserved() {
        assertTrue(BackgroundContinuityService.preferences(context).getBoolean(BackgroundContinuityService.ENABLED, false));
        assertFalse(BackgroundContinuityService.preferences(context).getBoolean(BackgroundContinuityService.USER_STOPPED, true));
        assertEquals("false", persistence.get(PREFIX + "autoSyncEnabled"));
    }

    private void refused() {
        assertTrue(fence.isBlocked());
        ExplicitTextIngressStore independent = new ExplicitTextIngressStore(context);
        assertEquals(ExplicitTextIngressStore.EnqueueResult.UNAVAILABLE, independent.enqueue(text(Intent.ACTION_SEND)));
        assertEquals(ExplicitTextIngressStore.EnqueueResult.UNAVAILABLE, independent.enqueue(text(Intent.ACTION_PROCESS_TEXT)));
        assertFalse(independent.prepare("old-action", "late-clip", 1L, 60000L));
        assertFalse(new PendingClipboardApplicationStore(context).write("late-remote-clip"));
        try { new PendingClipboardApplicationStore(context).read(); fail(); }
        catch (IllegalStateException expected) {}
        preserved();
    }

    private void completePrimitive() {
        persistence.set(PREFIX + "localDeviceIdentity", "{\"deviceId\":\"synthetic-new-peer\"}");
        persistence.set(PREFIX + "manualIdentityResetCompleted", "{\"operationId\":\"synthetic-runtime-reset\",\"generatedPeerId\":\"synthetic-new-peer\"}");
    }

    @Test public void conclusiveNonacceptanceRestoresOriginalQueuesAndPreferences() throws Exception {
        seed();
        fence.acquire();
        refused();
        fence.release();
        assertEquals(2, new JSONArray(new ExplicitTextIngressStore(context).actionsJson()).length());
        assertEquals("synthetic-former-remote-clip", new PendingClipboardApplicationStore(context).read());
        preserved();
    }

    @Test public void acceptedCleanupRemovesBothNativeQueuesAndRejectsIncompleteSubmissions() throws Exception {
        seed();
        fence.acquire();
        persistence.set(NativeIdentityResetFence.JOURNAL, "synthetic-accepted-native-intent");
        refused();
        fence.clearQueues(context);
        fence.verifyQueues(context);
        refused();
        try { fence.release(); fail(); } catch (IllegalStateException expected) {}
        try { fence.openAfterReconciliation(); fail(); } catch (IllegalStateException expected) {}
        try { fence.requireRestartReady(context); fail(); } catch (IllegalStateException expected) {}
        completePrimitive();
        persistence.remove(NativeIdentityResetFence.JOURNAL);
        fence.requireRestartReady(context);
        assertTrue("Restart acknowledgement must keep native admission sealed", fence.isBlocked());
        fence.openAfterReconciliation();
        assertEquals("[]", new ExplicitTextIngressStore(context).actionsJson());
        assertNull(new PendingClipboardApplicationStore(context).read());
        preserved();
        persistence.set(PREFIX + "manualIdentityResetCompleted", "{\"operationId\":1,\"generatedPeerId\":\"synthetic-new-peer\"}");
        refused(); // Native startup treats malformed metadata as unknown before a WebView exists.
    }

    @Test public void coldActivityServiceNotificationStopAndBootCannotCrossIncompleteReset() throws Exception {
        seed();
        fence.acquire();
        persistence.set(NativeIdentityResetFence.JOURNAL, "synthetic-accepted-native-intent");
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        notifications.cancel(BackgroundContinuityService.RECONNECT_NOTIFICATION_ID);
        // The production Activity may show recovery, but must not start its identity-bound services.
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<Plugin> formerPlugin = new AtomicReference<>();
            activity.onActivity(current -> formerPlugin.set(current.getBridge().getPlugin("IdentityResetStorage").getInstance()));
            activity.recreate(); // The same native recreation primitive used by restartRuntime.
            activity.onActivity(current -> assertNotSame("A document reload cannot rebuild native plugin owners",
                formerPlugin.get(), current.getBridge().getPlugin("IdentityResetStorage").getInstance()));
            assertFalse(MainActivity.hasActivityOwnedRuntime());
            activity.onActivity(current -> current.startService(new Intent(current, BackgroundContinuityService.class)
                .setAction(BackgroundContinuityService.ACTION_START)));
            SystemClock.sleep(200L);
            assertFalse(BackgroundContinuityService.isRunning());
            activity.onActivity(current -> current.startService(new Intent(current, BackgroundContinuityService.class)
                .setAction(BackgroundContinuityService.ACTION_STOP)));
            SystemClock.sleep(200L);
            preserved();
            new BackgroundContinuityBootReceiver().onReceive(context, new Intent(Intent.ACTION_BOOT_COMPLETED));
            for (StatusBarNotification notification : notifications.getActiveNotifications())
                assertNotEquals(BackgroundContinuityService.RECONNECT_NOTIFICATION_ID, notification.getId());
            refused();
        } finally {
            context.stopService(new Intent(context, BackgroundContinuityService.class));
        }
    }

    /** Run in a dedicated process; failed queue commit intentionally withholds cached proof. */
    @Test public void realNativeQueueCleanupCommitFailureKeepsAdmissionClosed() throws Exception {
        assumeTrue("true".equals(InstrumentationRegistry.getArguments().getString("runtimeResetFilesystemFault")));
        seed();
        fence.acquire();
        persistence.set(NativeIdentityResetFence.JOURNAL, "synthetic-accepted-native-intent");
        File directory = new File(context.getApplicationInfo().dataDir, "shared_prefs");
        int originalMode = Os.stat(directory.getAbsolutePath()).st_mode & 07777;
        // Seal is committed before restricting the queue's directory; the fault targets queue deletion.
        fence.seal();
        try {
            Os.chmod(directory.getAbsolutePath(), originalMode & ~0222);
            try { fence.clearQueues(context); fail("Unwritable preferences cannot acknowledge native queue cleanup"); }
            catch (IllegalStateException expected) { assertEquals("identity_reset_native_cleanup_unconfirmed", expected.getMessage()); }
        } finally {
            Os.chmod(directory.getAbsolutePath(), originalMode);
        }
        assertEquals(originalMode, Os.stat(directory.getAbsolutePath()).st_mode & 07777);
        try { fence.verifyQueues(context); fail("Restored permissions cannot confirm cached removals"); }
        catch (IllegalStateException expected) { assertEquals("identity_reset_native_cleanup_unconfirmed", expected.getMessage()); }
        refused();
    }

    private void phase(String expected, String previous) {
        assumeTrue(expected.equals(InstrumentationRegistry.getArguments().getString("runtimeResetPhase")));
        if (previous != null) {
            assertEquals(previous, persistence.get(CHECKPOINT));
            assertNotEquals("Force-stop between phases; a cached reopen is insufficient", Integer.toString(Process.myPid()), persistence.get(PID));
        }
    }

    private void checkpoint(String value) {
        persistence.set(CHECKPOINT, value);
        persistence.set(PID, Integer.toString(Process.myPid()));
    }

    @Test public void phase0DurableAdmissionAndIntent() {
        phase("0", null);
        seed();
        fence.acquire();
        persistence.set(NativeIdentityResetFence.JOURNAL, "synthetic-accepted-native-intent");
        refused();
        checkpoint("accepted");
    }

    @Test public void provisionalPhase0DurableAdmissionWithoutAcceptance() {
        phase("provisional-0", null);
        seed();
        fence.acquire();
        refused();
        checkpoint("provisional");
    }

    @Test public void provisionalPhase1ColdConclusiveNonacceptance() throws Exception {
        phase("provisional-1", "provisional");
        refused();
        fence.openAfterReconciliation();
        assertEquals(2, new JSONArray(new ExplicitTextIngressStore(context).actionsJson()).length());
        assertEquals("synthetic-former-remote-clip", new PendingClipboardApplicationStore(context).read());
        preserved();
    }

    @Test public void phase1ColdAdmissionAndDurableQueueCleanup() {
        phase("1", "accepted");
        refused();
        fence.clearQueues(context);
        fence.verifyQueues(context);
        completePrimitive();
        checkpoint("native-cleaned");
    }

    @Test public void phase2ColdCompletionReopensEmptyQueues() throws Exception {
        phase("2", "native-cleaned");
        refused();
        fence.verifyQueues(context);
        persistence.remove(NativeIdentityResetFence.JOURNAL);
        fence.openAfterReconciliation();
        assertEquals("[]", new ExplicitTextIngressStore(context).actionsJson());
        assertNull(new PendingClipboardApplicationStore(context).read());
        preserved();
        assertEquals(ExplicitTextIngressStore.EnqueueResult.QUEUED, new ExplicitTextIngressStore(context).enqueue(text(Intent.ACTION_SEND)));
        checkpoint("completed");
    }
}
