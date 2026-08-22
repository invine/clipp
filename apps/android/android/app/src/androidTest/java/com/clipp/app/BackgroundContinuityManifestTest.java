package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import android.content.ComponentName;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.core.app.ActivityScenario;
import androidx.test.espresso.Espresso;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.core.content.ContextCompat;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public final class BackgroundContinuityManifestTest {
    @Test
    public void taskRemovalIsDeliveredToBackgroundContinuityService() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ServiceInfo service = context.getPackageManager().getServiceInfo(
            new ComponentName(context, BackgroundContinuityService.class),
            PackageManager.GET_META_DATA
        );

        assertEquals(0, service.flags & ServiceInfo.FLAG_STOP_WITH_TASK);
    }

    @Test
    public void androidDiscoversProcessTextAndSharesheetIngress() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageManager packages = context.getPackageManager();

        assertIngressActivity(packages, new Intent(Intent.ACTION_PROCESS_TEXT).setType("text/plain"));
        assertIngressActivity(packages, new Intent(Intent.ACTION_SEND).setType("text/plain"));
    }

    @Test
    public void explicitTextQueueSurvivesRestartAndPreservesRepeatedEventIdentity() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences preferences = context.getSharedPreferences("explicit-text-ingress-test", Context.MODE_PRIVATE);
        preferences.edit().clear().commit();
        try {
            ExplicitTextIngressStore first = new ExplicitTextIngressStore(preferences);
            Intent selected = new Intent(Intent.ACTION_PROCESS_TEXT)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_PROCESS_TEXT, "same raw text");
            Intent shared = new Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, "same raw text");

            assertEquals(ExplicitTextIngressStore.EnqueueResult.QUEUED, first.enqueue(selected));
            ExplicitTextIngressStore restartedStore = new ExplicitTextIngressStore(preferences);
            assertEquals(1, new JSONArray(restartedStore.actionsJson()).length());
            assertEquals(ExplicitTextIngressStore.EnqueueResult.QUEUED, restartedStore.enqueue(shared));
            assertEquals(
                ExplicitTextIngressStore.EnqueueResult.INVALID,
                first.enqueue(new Intent(Intent.ACTION_SEND).setType("text/plain"))
            );

            JSONArray queued = new JSONArray(new ExplicitTextIngressStore(preferences).actionsJson());
            assertEquals(2, queued.length());
            JSONObject selection = queued.getJSONObject(0);
            JSONObject share = queued.getJSONObject(1);
            assertEquals("same raw text", selection.getString("text"));
            assertEquals("process-text", selection.getString("source"));
            assertEquals("send", share.getString("source"));
            assertNotEquals(selection.getString("id"), share.getString("id"));

            String actionId = selection.getString("id");
            assertTrue(first.prepare(actionId, "00000000-0000-4000-8000-000000000901", 123L));
            JSONArray restarted = new JSONArray(new ExplicitTextIngressStore(preferences).actionsJson());
            assertEquals("00000000-0000-4000-8000-000000000901", restarted.getJSONObject(0).getJSONObject("event").getString("clipId"));
            assertTrue(new ExplicitTextIngressStore(preferences).complete(actionId));
            assertEquals(1, new JSONArray(first.actionsJson()).length());
        } finally {
            preferences.edit().clear().commit();
        }
    }

    @Test
    public void persistenceFailureNeverReportsAnActionAsQueued() {
        DurableStringStore failing = new DurableStringStore() {
            @Override
            public String getString(String key, String fallback) {
                return fallback;
            }

            @Override
            public boolean putString(String key, String value) {
                return false;
            }

            @Override
            public boolean remove(String key) {
                return false;
            }
        };
        Intent shared = new Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, "raw text");

        assertEquals(
            ExplicitTextIngressStore.EnqueueResult.PERSISTENCE_FAILED,
            new ExplicitTextIngressStore(failing).enqueue(shared)
        );
    }

    @Test
    public void actionQueueUpdatesAreAtomicAcrossStoreInstances() throws Exception {
        AtomicReference<String> stored = new AtomicReference<>("["
            + "{\"id\":\"first\",\"text\":\"one\",\"source\":\"send\"},"
            + "{\"id\":\"second\",\"text\":\"two\",\"source\":\"send\"}"
            + "]");
        CountDownLatch reads = new CountDownLatch(2);
        DurableStringStore racing = new DurableStringStore() {
            @Override
            public String getString(String key, String fallback) {
                String snapshot = stored.get();
                reads.countDown();
                try {
                    reads.await(250, TimeUnit.MILLISECONDS);
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError(error);
                }
                return snapshot;
            }

            @Override
            public boolean putString(String key, String value) {
                stored.set(value);
                return true;
            }

            @Override
            public boolean remove(String key) {
                stored.set(null);
                return true;
            }
        };
        ExplicitTextIngressStore first = new ExplicitTextIngressStore(racing);
        ExplicitTextIngressStore second = new ExplicitTextIngressStore(racing);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<Boolean> prepared = executor.submit(() -> first.prepare(
                "first",
                "00000000-0000-4000-8000-000000000902",
                456L
            ));
            Future<Boolean> completed = executor.submit(() -> second.complete("second"));
            assertTrue(prepared.get(2, TimeUnit.SECONDS));
            assertTrue(completed.get(2, TimeUnit.SECONDS));
        } finally {
            executor.shutdownNow();
        }

        JSONArray actions = new JSONArray(stored.get());
        assertEquals(1, actions.length());
        assertEquals("first", actions.getJSONObject(0).getString("id"));
        assertEquals(
            "00000000-0000-4000-8000-000000000902",
            actions.getJSONObject(0).getJSONObject("event").getString("clipId")
        );
    }

    @Test
    public void coldProcessTextIntentReachesTheDurableQueueBeforeRuntimeLaunch() throws Exception {
        assertIntentReachesQueue(
            false,
            new Intent(Intent.ACTION_PROCESS_TEXT)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_PROCESS_TEXT, "cold selected text"),
            "cold selected text",
            "process-text"
        );
    }

    @Test
    public void warmSharesheetIntentReachesTheDurableQueue() throws Exception {
        assertIntentReachesQueue(
            true,
            new Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, "warm shared text"),
            "warm shared text",
            "send"
        );
    }

    private static void assertIngressActivity(PackageManager packages, Intent intent) {
        List<ResolveInfo> matches = packages.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
        assertTrue(matches.stream().anyMatch(match ->
            ExplicitTextIngressActivity.class.getName().equals(match.activityInfo.name)
        ));
    }

    private static void assertIntentReachesQueue(
        boolean warmRuntime,
        Intent intent,
        String expectedText,
        String expectedSource
    ) throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences preferences = context.getSharedPreferences(
            ClipContinuityPreferences.NAME,
            Context.MODE_PRIVATE
        );
        preferences.edit().clear().commit();
        CountDownLatch queued = new CountDownLatch(1);
        AtomicReference<String> queueAtSignal = new AtomicReference<>();
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ignored, Intent signal) {
                queueAtSignal.set(new ExplicitTextIngressStore(preferences).actionsJson());
                queued.countDown();
            }
        };
        ContextCompat.registerReceiver(
            context,
            receiver,
            new IntentFilter(ExplicitTextIngressStore.ACTION_EXPLICIT_TEXT_QUEUED),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
        ActivityScenario<MainActivity> main = warmRuntime
            ? ActivityScenario.launch(MainActivity.class)
            : null;
        try {
            if (warmRuntime) assertTrue(MainActivity.hasActivityOwnedRuntime());
            else assertFalse(MainActivity.hasActivityOwnedRuntime());
            try (ActivityScenario<ExplicitTextIngressActivity> ignored = ActivityScenario.launch(
                intent.setClass(context, ExplicitTextIngressActivity.class)
            )) {
                assertTrue(queued.await(2, TimeUnit.SECONDS));
            }
            if (!warmRuntime) assertTrue(MainActivity.hasActivityOwnedRuntime());
            JSONArray actions = new JSONArray(queueAtSignal.get());
            assertEquals(1, actions.length());
            assertEquals(expectedText, actions.getJSONObject(0).getString("text"));
            assertEquals(expectedSource, actions.getJSONObject(0).getString("source"));
        } finally {
            if (main != null) main.close();
            else if (MainActivity.hasActivityOwnedRuntime()) Espresso.pressBack();
            context.unregisterReceiver(receiver);
            preferences.edit().clear().commit();
        }
    }
}
