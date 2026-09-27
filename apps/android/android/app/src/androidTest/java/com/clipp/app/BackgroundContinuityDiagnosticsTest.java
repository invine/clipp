package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static com.clipp.app.BackgroundContinuityConnectionState.CONNECTED;
import static com.clipp.app.BackgroundContinuityConnectionState.RECONNECTING;
import static com.clipp.app.BackgroundContinuityDiagnostics.FailureReason.HEARTBEAT_EXPIRED;
import static com.clipp.app.BackgroundContinuityDiagnostics.HeartbeatTransition.EXPIRED;
import static com.clipp.app.BackgroundContinuityDiagnostics.ServiceTransition.DESTROYED;
import static com.clipp.app.BackgroundContinuityDiagnostics.ServiceTransition.RUNNING;
import static com.clipp.app.BackgroundContinuityDiagnostics.ServiceTransition.STOPPED_TASK_REMOVED;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
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
            diagnostics.recordServiceTransition(index % 2 == 0 ? RUNNING : DESTROYED);
        }
        diagnostics.recordHeartbeatTransition(EXPIRED);
        diagnostics.recordConnectionTransition(RECONNECTING, 0);
        diagnostics.recordConnectionTransition(CONNECTED, 2);
        diagnostics.recordPendingActionCount(3);
        diagnostics.recordPendingApplication(true);
        diagnostics.recordCaptureEligibility(false);
        diagnostics.recordNotificationAvailability(false);
        diagnostics.recordEnvironmentSnapshot();

        JSONObject exported = new JSONObject(diagnostics.exportJson());
        JSONArray events = exported.getJSONArray("events");

        assertEquals(2, exported.getInt("schemaVersion"));
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
            "available",
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
    }

    @Test
    public void repeatedObservedFailuresMarkTheConfigurationLimitedAndEnableGuidance() throws Exception {
        diagnostics.recordObservedFailure(HEARTBEAT_EXPIRED);
        diagnostics.recordObservedFailure(HEARTBEAT_EXPIRED);

        JSONObject beforeThreshold = diagnostics.statusJson();
        assertEquals(2, beforeThreshold.getInt("observedBackgroundFailureCount"));
        assertEquals("unqualified", beforeThreshold.getString("supportState"));
        assertFalse(beforeThreshold.getBoolean("batteryOptimizationGuidance"));

        diagnostics.recordObservedFailure(HEARTBEAT_EXPIRED);

        JSONObject limited = diagnostics.statusJson();
        assertEquals(3, limited.getInt("observedBackgroundFailureCount"));
        assertEquals("limited", limited.getString("supportState"));
        assertTrue(limited.getBoolean("batteryOptimizationGuidance"));
    }

    @Test
    public void diagnosticExportReusesOneBoundedCacheFile() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File first = BackgroundContinuityPlugin.writeDiagnosticsExport(context);
        File second = BackgroundContinuityPlugin.writeDiagnosticsExport(context);

        assertEquals(first.getCanonicalPath(), second.getCanonicalPath());
        File[] exports = first.getParentFile().listFiles((directory, name) ->
            name.startsWith("clipp-background-continuity") && name.endsWith(".json")
        );
        assertNotNull(exports);
        assertEquals(1, exports.length);
    }

    @Test
    public void reconnectDurationDoesNotSpanStoppedSessions() throws Exception {
        diagnostics.recordConnectionTransition(RECONNECTING, 0);
        diagnostics.recordServiceTransition(STOPPED_TASK_REMOVED);
        diagnostics.recordConnectionTransition(CONNECTED, 1);

        JSONArray events = new JSONObject(diagnostics.exportJson()).getJSONArray("events");
        JSONObject connected = events.getJSONObject(events.length() - 1);
        assertEquals("connected", connected.getString("value"));
        assertFalse(connected.has("durationMs"));
    }

    private static Set<String> keys(JSONObject object) {
        Set<String> result = new HashSet<>();
        Iterator<String> keys = object.keys();
        while (keys.hasNext()) result.add(keys.next());
        return result;
    }
}
