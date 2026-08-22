package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

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
        ExplicitTextIngressStore.Persistence failing = new ExplicitTextIngressStore.Persistence() {
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
    public void onlyColdIngressLaunchesTheActivityOwnedRuntime() {
        assertTrue(ExplicitTextIngressActivity.shouldLaunchRuntime(false));
        assertTrue(!ExplicitTextIngressActivity.shouldLaunchRuntime(true));
    }

    private static void assertIngressActivity(PackageManager packages, Intent intent) {
        List<ResolveInfo> matches = packages.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
        assertTrue(matches.stream().anyMatch(match ->
            ExplicitTextIngressActivity.class.getName().equals(match.activityInfo.name)
        ));
    }
}
