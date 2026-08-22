package com.clipp.app;

import android.app.ActivityManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Bounded, local-only lifecycle evidence for the Android background experiment.
 * Every writer is typed so Clip values and identity/protocol material have no
 * path into the diagnostic schema.
 */
final class BackgroundContinuityDiagnostics {
    static final int MAX_EVENTS = 512;
    private static final int LIMITED_FAILURE_THRESHOLD = 3;
    private static final String PREFERENCES = "clipp_background_continuity_diagnostics";
    private static final String EVENTS = "events";
    private static final String FAILURE_COUNT = "observedBackgroundFailureCount";
    private static final String RECONNECT_STARTED_AT = "reconnectStartedAt";
    private static final String LAST_CONNECTION_STATE = "lastConnectionState";
    private static final String LAST_CONNECTED_COUNT = "lastConnectedCount";
    private static final Object LOCK = new Object();

    private final Context context;
    private final SharedPreferences preferences;

    BackgroundContinuityDiagnostics(Context context) {
        this.context = context.getApplicationContext();
        this.preferences = this.context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    void recordServiceTransition(String state) {
        append(valueEvent("service_transition", allowedValue(
            state,
            "start_requested",
            "stop_requested",
            "running",
            "stopped_by_user",
            "stopped_runtime_lost",
            "stopped_task_removed",
            "destroyed"
        )));
    }

    void recordHeartbeatTransition(String state) {
        append(valueEvent("heartbeat_transition", allowedValue(state, "awaiting", "healthy", "expired")));
    }

    void recordLifecycleTransition(String state) {
        append(valueEvent("lifecycle_transition", allowedValue(
            state,
            "notification_stop",
            "notification_pause",
            "notification_resume",
            "task_removed",
            "boot_completed",
            "boot_reconnect_offered"
        )));
    }

    void recordConnectionTransition(String state, int connectedCount) {
        synchronized (LOCK) {
            state = allowedValue(state, "connected", "waiting", "reconnecting", "paused", "disconnected");
            int safeCount = Math.max(0, connectedCount);
            String previousState = preferences.getString(LAST_CONNECTION_STATE, null);
            int previousCount = preferences.getInt(LAST_CONNECTED_COUNT, -1);
            if (state.equals(previousState) && safeCount == previousCount) return;

            long now = System.currentTimeMillis();
            Long reconnectDurationMs = null;
            SharedPreferences.Editor editor = preferences.edit()
                .putString(LAST_CONNECTION_STATE, state)
                .putInt(LAST_CONNECTED_COUNT, safeCount);
            if ("reconnecting".equals(state) && !preferences.contains(RECONNECT_STARTED_AT)) {
                editor.putLong(RECONNECT_STARTED_AT, now);
            } else if ("connected".equals(state) && preferences.contains(RECONNECT_STARTED_AT)) {
                reconnectDurationMs = Math.max(0L, now - preferences.getLong(RECONNECT_STARTED_AT, now));
                editor.remove(RECONNECT_STARTED_AT);
            }
            editor.commit();

            JSONObject event = event("connection_transition");
            put(event, "value", state);
            put(event, "count", safeCount);
            if (reconnectDurationMs != null) put(event, "durationMs", reconnectDurationMs);
            appendLocked(event);
        }
    }

    void recordPendingActionCount(int count) {
        JSONObject event = event("pending_action_count");
        put(event, "count", Math.max(0, count));
        append(event);
    }

    void recordPendingApplication(boolean present) {
        JSONObject event = event("pending_application_presence");
        put(event, "present", present);
        append(event);
    }

    void recordCaptureEligibility(boolean eligible) {
        JSONObject event = event("clipboard_capture_eligibility");
        put(event, "eligible", eligible);
        append(event);
    }

    void recordNotificationPermission(boolean granted) {
        JSONObject event = event("notification_permission");
        put(event, "granted", granted);
        append(event);
    }

    void recordEnvironmentSnapshot() {
        JSONObject event = event("environment_snapshot");
        copyEnvironmentFields(environment(), event);
        append(event);
    }

    void recordObservedFailure(String reason) {
        synchronized (LOCK) {
            int failures = preferences.getInt(FAILURE_COUNT, 0) + 1;
            preferences.edit().putInt(FAILURE_COUNT, failures).commit();
            appendLocked(valueEvent("observed_background_failure", allowedValue(reason, "heartbeat_expired")));
        }
    }

    JSONObject statusJson() {
        int failures = preferences.getInt(FAILURE_COUNT, 0);
        JSONObject status = new JSONObject();
        put(status, "observedBackgroundFailureCount", failures);
        put(status, "supportState", failures >= LIMITED_FAILURE_THRESHOLD ? "limited" : "unqualified");
        put(status, "batteryOptimizationGuidance", failures >= LIMITED_FAILURE_THRESHOLD);
        return status;
    }

    String exportJson() {
        synchronized (LOCK) {
            JSONObject exported = new JSONObject();
            put(exported, "schemaVersion", 1);
            put(exported, "exportedAt", System.currentTimeMillis());
            put(exported, "environment", environment());
            JSONObject status = statusJson();
            put(exported, "observedBackgroundFailureCount", status.optInt("observedBackgroundFailureCount"));
            put(exported, "supportState", status.optString("supportState"));
            put(exported, "events", readEvents());
            return exported.toString();
        }
    }

    void clearForTesting() {
        synchronized (LOCK) {
            preferences.edit().clear().commit();
        }
    }

    private JSONObject environment() {
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        ActivityManager activity = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        JSONObject environment = new JSONObject();
        put(environment, "androidApiLevel", Build.VERSION.SDK_INT);
        put(environment, "androidRelease", Build.VERSION.RELEASE);
        put(environment, "manufacturer", Build.MANUFACTURER);
        put(environment, "model", Build.MODEL);
        put(environment, "powerSaveMode", power != null && power.isPowerSaveMode());
        put(
            environment,
            "ignoringBatteryOptimizations",
            power != null && power.isIgnoringBatteryOptimizations(context.getPackageName())
        );
        put(environment, "backgroundRestricted", activity != null && Build.VERSION.SDK_INT >= 28 && activity.isBackgroundRestricted());
        return environment;
    }

    private static void copyEnvironmentFields(JSONObject source, JSONObject target) {
        for (String key : new String[] {
            "androidApiLevel",
            "androidRelease",
            "manufacturer",
            "model",
            "powerSaveMode",
            "ignoringBatteryOptimizations",
            "backgroundRestricted"
        }) {
            put(target, key, source.opt(key));
        }
    }

    private static JSONObject valueEvent(String name, String value) {
        JSONObject event = event(name);
        put(event, "value", value);
        return event;
    }

    private static String allowedValue(String candidate, String... allowed) {
        for (String value : allowed) {
            if (value.equals(candidate)) return value;
        }
        return "unknown";
    }

    private static JSONObject event(String name) {
        JSONObject event = new JSONObject();
        put(event, "timestamp", System.currentTimeMillis());
        put(event, "event", name);
        return event;
    }

    private void append(JSONObject event) {
        synchronized (LOCK) {
            appendLocked(event);
        }
    }

    private void appendLocked(JSONObject event) {
        JSONArray current = readEvents();
        JSONArray bounded = new JSONArray();
        int first = Math.max(0, current.length() - MAX_EVENTS + 1);
        for (int index = first; index < current.length(); index += 1) {
            JSONObject retained = current.optJSONObject(index);
            if (retained != null) bounded.put(retained);
        }
        bounded.put(event);
        preferences.edit().putString(EVENTS, bounded.toString()).commit();
    }

    private JSONArray readEvents() {
        try {
            return new JSONArray(preferences.getString(EVENTS, "[]"));
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private static void put(JSONObject target, String key, Object value) {
        try {
            target.put(key, value);
        } catch (JSONException error) {
            throw new IllegalStateException("diagnostic_serialization_failed", error);
        }
    }
}
