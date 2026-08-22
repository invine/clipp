package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.Set;
import java.util.HashSet;
import java.util.Iterator;

@RunWith(AndroidJUnit4.class)
public final class BackgroundContinuityDiagnosticsTest {
    private BackgroundContinuityDiagnostics diagnostics;

    @Before
    public void setUp() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        diagnostics = new BackgroundContinuityDiagnostics(context);
        diagnostics.clearForTesting();
    }

    @After
    public void tearDown() {
        diagnostics.clearForTesting();
    }

    @Test
    public void exportIsBoundedAndUsesOnlyThePrivacyReviewedSchema() throws Exception {
        for (int index = 0; index < 600; index += 1) {
            diagnostics.recordServiceTransition(index % 2 == 0 ? "running" : "stopped");
        }
        diagnostics.recordHeartbeatTransition("expired");
        diagnostics.recordConnectionTransition("reconnecting", 0);
        diagnostics.recordConnectionTransition("connected", 2);
        diagnostics.recordPendingActionCount(3);
        diagnostics.recordPendingApplication(true);
        diagnostics.recordCaptureEligibility(false);
        diagnostics.recordNotificationPermission(false);
        diagnostics.recordEnvironmentSnapshot();
        diagnostics.recordServiceTransition("diagnostic-secret-payload");
        diagnostics.recordHeartbeatTransition("diagnostic-secret-payload");
        diagnostics.recordLifecycleTransition("diagnostic-secret-payload");
        diagnostics.recordConnectionTransition("diagnostic-secret-payload", 0);

        JSONObject exported = new JSONObject(diagnostics.exportJson());
        JSONArray events = exported.getJSONArray("events");

        assertEquals(1, exported.getInt("schemaVersion"));
        assertEquals(BackgroundContinuityDiagnostics.MAX_EVENTS, events.length());
        assertEquals(
            Set.of(
                "schemaVersion",
                "exportedAt",
                "environment",
                "observedBackgroundFailureCount",
                "supportState",
                "events"
            ),
            keys(exported)
        );
        assertEquals(
            Set.of(
                "androidApiLevel",
                "androidRelease",
                "manufacturer",
                "model",
                "powerSaveMode",
                "ignoringBatteryOptimizations",
                "backgroundRestricted"
            ),
            keys(exported.getJSONObject("environment"))
        );
        Set<String> allowedEventKeys = Set.of(
            "timestamp",
            "event",
            "value",
            "count",
            "durationMs",
            "present",
            "eligible",
            "granted",
            "androidApiLevel",
            "androidRelease",
            "manufacturer",
            "model",
            "powerSaveMode",
            "ignoringBatteryOptimizations",
            "backgroundRestricted"
        );
        for (int index = 0; index < events.length(); index += 1) {
            assertTrue(allowedEventKeys.containsAll(keys(events.getJSONObject(index))));
        }

        String raw = exported.toString();
        assertFalse(raw.contains("clipContent"));
        assertFalse(raw.contains("rawShareIntent"));
        assertFalse(raw.contains("privateKey"));
        assertFalse(raw.contains("signature"));
        assertFalse(raw.contains("peerId"));
        assertFalse(raw.contains("deviceName"));
        assertFalse(raw.contains("localDeviceAlias"));
        assertFalse(raw.contains("protocolFrame"));
        assertFalse(raw.contains("diagnostic-secret-payload"));
    }

    @Test
    public void repeatedObservedFailuresMarkTheConfigurationLimitedAndEnableGuidance() throws Exception {
        diagnostics.recordObservedFailure("heartbeat_expired");
        diagnostics.recordObservedFailure("heartbeat_expired");

        JSONObject beforeThreshold = diagnostics.statusJson();
        assertEquals(2, beforeThreshold.getInt("observedBackgroundFailureCount"));
        assertEquals("unqualified", beforeThreshold.getString("supportState"));
        assertFalse(beforeThreshold.getBoolean("batteryOptimizationGuidance"));

        diagnostics.recordObservedFailure("heartbeat_expired");

        JSONObject limited = diagnostics.statusJson();
        assertEquals(3, limited.getInt("observedBackgroundFailureCount"));
        assertEquals("limited", limited.getString("supportState"));
        assertTrue(limited.getBoolean("batteryOptimizationGuidance"));
    }

    private static Set<String> keys(JSONObject object) {
        Set<String> result = new HashSet<>();
        Iterator<String> keys = object.keys();
        while (keys.hasNext()) result.add(keys.next());
        return result;
    }
}
