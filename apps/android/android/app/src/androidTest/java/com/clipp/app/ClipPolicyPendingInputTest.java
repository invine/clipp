package com.clipp.app;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Process;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.model.MultipleFailureException;

/**
 * Root interrupts A during its proved checkpoint, then invokes B in a new process.
 * Only a genuine SEND event is faulted, using a real public IndexedDB transaction abort.
 * Root's separate asynchronous readonly metadata/PID/cleanup evidence is mandatory.
 * This is not a spontaneous storage outage, a product command or whole ticket20 acceptance.
 */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class ClipPolicyPendingInputTest {
    private static final String TAG = "ClippPolicyPending";
    private static final String BUFFER = "globalThis.__clippPolicyPendingWitness20";
    private static final String PENDING_MESSAGE = "Clipboard History storage is unavailable. Clipp will retry pending Clips automatically.";
    private static final String UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
    private static final long HOUR_MS = 3_600_000;
    private static final long DAY_MS = 86_400_000;
    private static final long WEEK_MS = 604_800_000;
    private static final long TIMEOUT_MS = 20_000;
    private static final int MAX_BYTES = 65_536;
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private Context context;
    private Bundle arguments;
    private String nonce;
    private String phase;
    private String marker;
    private long holdMs;
    private long mainLaunchAt;
    private File directory;
    private ActivityScenario<MainActivity> scenario;
    private NativePublicWebView web;
    private boolean installed;
    private JSONObject expected;

    @Before
    public void requireRootAssignedIsolatedPackagedCandidate() throws Exception {
        context = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(context.getPackageName());
        arguments = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Root must explicitly assign this pending-event interval",
            "true".equals(arguments.getString("clipPolicyPendingAcceptance")));
        nonce = arguments.getString("clipPolicyPendingNonce", "");
        assertTrue("Fresh exact root nonce required", nonce.matches("[A-Za-z0-9-]{1,32}"));
        marker = "clip-policy-pending-" + nonce;
        phase = arguments.getString("clipPolicyPendingPhase", "");
        assertTrue("Invoke one separately assigned phase A or B", phase.matches("[AB]"));
        assertEquals("Root must reserve the exact bounded checkpoint hold", "30000",
            arguments.getString("clipPolicyPendingWitnessHoldMs", ""));
        holdMs = 30_000;
        try (InputStream stream = context.getAssets().open("capacitor.config.json")) {
            JSONObject server = new JSONObject(read(stream, 32_768)).optJSONObject("server");
            assertTrue("Packaged production assets required; dev server refused", server == null || !server.has("url"));
        }
        try (InputStream stream = context.getAssets().open("public/index.html")) { assertNotEquals(-1, stream.read()); }
        directory = new File(context.getCacheDir(), "policy20-pending-" + nonce + "-" + phase);
        assertTrue("Preserve earlier artifacts; use a fresh root case", !directory.exists() && directory.mkdir());
        emit("ARTIFACT_DIRECTORY", new JSONObject().put("path", directory.getAbsolutePath()));
        if ("B".equals(phase)) {
            expected = expectedFromRoot();
            assertNotEquals("B requires a real root-proved process boundary",
                arguments.getString("clipPolicyPendingFormerPid"), String.valueOf(Process.myPid()));
            assertPolicyNative("sharingLifetimeMs", WEEK_MS);
            assertPolicyNative("localRetentionMs", WEEK_MS);
            JSONObject beforeLaunch = matchingAction();
            assertNotNull("Read the genuinely durable prepared native action before launching MainActivity", beforeLaunch);
            assertPrepared(beforeLaunch, expected);
            artifact("native-before-main.json", beforeLaunch);
        } else {
            assertNull("A starts without an existing matching action", matchingAction());
        }
        mainLaunchAt = System.currentTimeMillis();
        scenario = ActivityScenario.launch(MainActivity.class);
        web = new NativePublicWebView(instrumentation, scenario);
        web.await("ordinary packaged workspace", "document.querySelector('nav[aria-label=\"Clipp destinations\"]') !== null");
        assertEquals("https://localhost/", web.evaluate("location.origin + location.pathname"));
        assertEquals("No owning reset entry or previously installed fault", "true", web.evaluate(
            "!document.getElementById('clipp-reset-owning-progress') && !Object.prototype.hasOwnProperty.call(globalThis,'__clippPolicyPendingWitness20')"));
    }

    @After
    public void restoreOnlyOwnedFaultAndCloseActivityIfProcessSurvived() throws Exception {
        List<Throwable> failures = new ArrayList<>();
        if (installed && web != null) {
            try {
                String result = web.evaluate("(" + BUFFER + " ? " + BUFFER + ".dispose() : null)");
                artifact("fault-cleanup.json", new JSONObject(result));
                JSONObject cleanup = new JSONObject(result);
                assertTrue("Owned public descriptor must restore on surviving-process cleanup", cleanup.getBoolean("restored"));
                assertEquals("Owned witness global must be removed", "false", web.evaluate(
                    "Object.prototype.hasOwnProperty.call(globalThis,'__clippPolicyPendingWitness20')"));
            } catch (Throwable error) { failures.add(error); }
        }
        if (web != null) {
            try { web.closeActivity(); } catch (Throwable error) { failures.add(error); }
        } else if (scenario != null) {
            try { NativePublicWebView.closeScenarioBounded(scenario); } catch (Throwable error) { failures.add(error); }
        }
        MultipleFailureException.assertEmpty(failures);
    }

    @Test
    public void phaseA_pendingNativeEventKeepsOriginalLifetimeWhilePolicyChangesBeforeAbruptStop() throws Exception {
        assertEquals("Invoke phase A alone", "A", phase);
        openSettings();
        awaitPolicy("Keep unpinned history", 30 * DAY_MS);
        awaitPolicy("Clip Sharing Lifetime", DAY_MS);
        selectPolicy("Keep unpinned history", "7 days", WEEK_MS);
        selectPolicy("Clip Sharing Lifetime", "1 hour", HOUR_MS);
        openHistory();
        awaitNoCard();
        String source;
        try (InputStream stream = instrumentation.getContext().getAssets().open("retention-pending-transaction-witness.js")) {
            source = read(stream, 32_768);
        }
        JSONObject config = new JSONObject().put("nonce", nonce).put("marker", marker);
        installed = true;
        JSONObject installation = new JSONObject(web.evaluate("(" + source + ")(" + config + ")"));
        assertTrue("Real descriptor owned before genuine SEND", installation.getBoolean("descriptorOwned"));
        artifact("fault-installed.json", installation);
        long dispatchedAt = System.currentTimeMillis();
        context.startActivity(new Intent(context, ExplicitTextIngressActivity.class)
            .setAction(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, marker).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        JSONObject prepared = awaitPreparedAction();
        expected = eventFromAction(prepared);
        assertTrue("The native event was prepared after this original SEND", expected.getLong("capturedAt") >= dispatchedAt);
        JSONObject fault = awaitActualAbort();
        assertStagedMatches(fault.getJSONObject("event"), expected);
        showPendingIssue();
        artifact("native-pending-before-policy.json", prepared);
        web.tap(web.button("Close"));
        openSettings();
        selectPolicy("Clip Sharing Lifetime", "7 days", WEEK_MS);
        assertPrepared(matchingAction(), expected);
        openHistory();
        awaitNoCard();
        showPendingIssue();
        fault = faultSnapshot();
        assertStagedMatches(fault.getJSONObject("event"), expected);
        assertTrue("The entire root checkpoint hold must fit inside the immutable fault deadline",
            fault.getDouble("elapsedMs") + holdMs < 120_000);
        JSONObject stillPrepared = matchingAction();
        assertPrepared(stillPrepared, expected);
        artifact("native-pending-after-policy.json", stillPrepared);
        JSONObject checkpoint = eventCheckpoint(expected).put("dispatchedAt", dispatchedAt)
            .put("checkpointAt", System.currentTimeMillis()).put("appliedSharingLifetimeMs", WEEK_MS)
            .put("appliedLocalRetentionMs", WEEK_MS).put("holdMs", holdMs)
            .put("requiresRootReadonlyAbsence", true).put("expectedInterruption", true);
        checkpoint.put("faultSnapshot", artifact("fault-before-force-stop.json", fault));
        artifact("ready-to-force-stop.json", checkpoint);
        emit("READY_TO_FORCESTOP", checkpoint);
        // Only the test thread waits. Normal app retries remain real and faulted.
        // Root must interrupt this actual process, not let @After close it first.
        SystemClock.sleep(holdMs);
        fail("root_abrupt_stop_not_observed: A must be interrupted after its proved checkpoint, never JUnit PASS");
    }

    @Test
    public void phaseB_newProcessReplaysPreparedEventOnceWithOriginalDeadline() throws Exception {
        assertEquals("Invoke phase B alone after root's checkpoint interruption", "B", phase);
        long acceptanceObservedAt;
        openHistory();
        web.await("one normally replayed Local Clip with the original ID", cards() + ".length === 1 && "
            + cards() + "[0].getAttribute('data-clip-id') === " + JSONObject.quote(expected.getString("clipId"))
            + " && " + cards() + "[0].querySelector('.pill-source')?.textContent.trim() === 'Local'");
        awaitActionCompleted();
        acceptanceObservedAt = System.currentTimeMillis();
        assertPolicyNative("sharingLifetimeMs", WEEK_MS);
        assertPolicyNative("localRetentionMs", WEEK_MS);
        openSettings();
        awaitPolicy("Clip Sharing Lifetime", WEEK_MS);
        awaitPolicy("Keep unpinned history", WEEK_MS);
        openHistory();
        assertNoPendingIssue();
        JSONObject ready = eventCheckpoint(expected).put("acceptanceObservedAt", acceptanceObservedAt)
            .put("appliedSharingLifetimeMs", WEEK_MS).put("holdMs", holdMs)
            .put("requiresRootReadonlyMetadata", true);
        artifact("ready-readonly-witness.json", ready);
        emit("READY_READONLY_WITNESS", ready);
        SystemClock.sleep(holdMs);
        // This is an actual external Settings route; no synthetic resume callback.
        context.startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(android.net.Uri.parse("package:" + context.getPackageName()))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        awaitExternalSettings();
        assertTrue("Android accepts the actual Settings Back", instrumentation.getUiAutomation()
            .performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK));
        awaitForeground();
        web.await("same single Clip after real Settings return", cards() + ".length === 1 && "
            + cards() + "[0].getAttribute('data-clip-id') === " + JSONObject.quote(expected.getString("clipId")));
        assertNull("The real native action stays completed", matchingAction());
        assertNoPendingIssue();
        JSONObject finalWitness = eventCheckpoint(expected).put("appliedSharingLifetimeMs", WEEK_MS)
            .put("holdMs", holdMs).put("requiresRootReadonlyMetadata", true);
        artifact("final-readonly-witness.json", finalWitness);
        emit("FINAL_READONLY_WITNESS", finalWitness);
        SystemClock.sleep(holdMs);
    }

    private JSONObject expectedFromRoot() throws Exception {
        String former = arguments.getString("clipPolicyPendingFormerPid", "");
        assertTrue("Root must supply the actual former PID", former.matches("[1-9][0-9]{0,9}"));
        String actionId = requiredUuid("clipPolicyPendingActionId");
        String clipId = requiredUuid("clipPolicyPendingClipId");
        String origin = arguments.getString("clipPolicyPendingOriginPeerId", "");
        assertTrue("Root supplies the original public local origin", origin.matches("12D3KooW[A-Za-z0-9]{40,60}"));
        long capturedAt = requiredLong("clipPolicyPendingCapturedAt");
        long shareExpiresAt = requiredLong("clipPolicyPendingShareExpiresAt");
        assertEquals("The prepared event keeps its original one-hour lifetime", HOUR_MS, shareExpiresAt - capturedAt);
        return new JSONObject().put("actionId", actionId).put("clipId", clipId).put("capturedAt", capturedAt)
            .put("sharingLifetimeMs", HOUR_MS).put("shareExpiresAt", shareExpiresAt).put("originPeerId", origin);
    }

    private JSONObject matchingAction() throws Exception {
        String raw = context.getSharedPreferences(ClipContinuityPreferences.NAME, Context.MODE_PRIVATE).getString("actions", "[]");
        assertNotNull("Native queue read must be available", raw);
        assertTrue("Bound the read-only native queue observation", raw.getBytes(StandardCharsets.UTF_8).length <= MAX_BYTES);
        JSONArray actions = new JSONArray(raw);
        assertTrue("Fresh isolated case must have a bounded native queue", actions.length() <= 16);
        JSONObject matching = null;
        for (int index = 0; index < actions.length(); index++) {
            JSONObject action = actions.getJSONObject(index);
            if (!marker.equals(action.optString("text"))) continue;
            assertNull("One genuine Intent produces one native queued action", matching);
            assertEquals("send", action.getString("source"));
            assertTrue(action.getString("id").matches(UUID));
            matching = action;
        }
        return matching;
    }

    private JSONObject awaitPreparedAction() throws Exception {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            JSONObject action = matchingAction();
            if (action != null && action.optJSONObject("event") != null) return action;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Real SEND was not durably prepared; " + web.timeoutDiagnostics());
    }

    private JSONObject eventFromAction(JSONObject action) throws Exception {
        JSONObject event = action.getJSONObject("event");
        assertTrue(event.getString("clipId").matches(UUID));
        assertEquals(HOUR_MS, event.getLong("sharingLifetimeMs"));
        assertTrue(event.getLong("capturedAt") > 0 && event.getLong("capturedAt") <= 9_007_199_250_140_991L);
        return new JSONObject().put("actionId", action.getString("id")).put("clipId", event.getString("clipId"))
            .put("capturedAt", event.getLong("capturedAt")).put("sharingLifetimeMs", HOUR_MS)
            .put("shareExpiresAt", event.getLong("capturedAt") + HOUR_MS);
    }

    private void assertPrepared(JSONObject actual, JSONObject original) throws Exception {
        assertNotNull("Actual native action must remain pending before acceptance", actual);
        JSONObject event = actual.getJSONObject("event");
        assertEquals(original.getString("actionId"), actual.getString("id"));
        assertEquals(original.getString("clipId"), event.getString("clipId"));
        assertEquals(original.getLong("capturedAt"), event.getLong("capturedAt"));
        assertEquals(HOUR_MS, event.getLong("sharingLifetimeMs"));
    }

    private JSONObject faultSnapshot() throws Exception {
        JSONObject snapshot = new JSONObject(web.evaluate(BUFFER + ".read()"));
        assertEquals(nonce, snapshot.getString("nonce"));
        assertTrue("The marker fault must remain active and owned", snapshot.getBoolean("armed") && snapshot.getBoolean("descriptorOwned"));
        assertTrue("A sticky collector/fault failure invalidates the case: " + snapshot, snapshot.isNull("failure"));
        assertEquals(0, snapshot.getInt("completes"));
        assertTrue(snapshot.getDouble("elapsedMs") < 120_000);
        return snapshot;
    }

    private JSONObject awaitActualAbort() throws Exception {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            JSONObject snapshot = faultSnapshot();
            if (snapshot.getInt("aborts") >= 1) return snapshot;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("No real target transaction abort observed");
    }

    private void assertStagedMatches(JSONObject staged, JSONObject original) throws Exception {
        assertEquals(original.getString("clipId"), staged.getString("id"));
        assertEquals(marker, staged.getString("content"));
        assertEquals(original.getLong("capturedAt"), staged.getLong("capturedAt"));
        assertEquals(original.getLong("shareExpiresAt"), staged.getLong("shareExpiresAt"));
        String origin = staged.getString("originPeerId");
        if (original.has("originPeerId")) assertEquals(original.getString("originPeerId"), origin);
        else original.put("originPeerId", origin);
    }

    private void awaitActionCompleted() throws Exception {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            if (matchingAction() == null) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        fail("Normal startup did not durably complete the original native action");
    }

    private void openSettings() throws Exception {
        web.tap(web.button("Settings"));
        web.await("Settings selected with applied policies", "document.querySelector('nav button[aria-current=\"page\"]')?.textContent.trim() === 'Settings' && [...document.querySelectorAll('.clip-settings select')].length === 2 && [...document.querySelectorAll('.clip-settings select')].every(e => !e.disabled && e.value !== '' && e.getAttribute('aria-busy') !== 'true')");
    }

    private void openHistory() throws Exception {
        web.tap(web.button("History"));
        web.await("History selected", "document.querySelector('nav button[aria-current=\"page\"]')?.textContent.trim() === 'History'");
        if (!"true".equals(web.evaluate("!!(" + web.button("All") + ")"))) web.tap(web.button("Filters"));
        web.tap(web.button("All"));
        web.await("Actual All History is available", "(" + web.button("All") + ")?.getAttribute('aria-pressed') === 'true' && !document.querySelector('[data-session-scroll=\"history\"] .initialization-error') && ![...document.querySelectorAll('[role=status]')].some(e => e.getClientRects().length && e.textContent.trim() === 'Loading History…')");
    }

    private String cards() {
        return "[...document.querySelectorAll('.history-card')].filter(e => e.getClientRects().length && e.querySelector('.history-text')?.textContent === " + JSONObject.quote(marker) + ")";
    }

    private void awaitNoCard() throws Exception { web.await("Pending is not accepted History", cards() + ".length === 0"); }

    private void showPendingIssue() throws Exception {
        web.await("Pending storage issue is discoverable", "!!document.querySelector('button[data-session-focus=\"issues-summary\"]')");
        web.tap("document.querySelector('button[data-session-focus=\"issues-summary\"]')");
        web.await("Actual pending storage failure is visible", "[...document.querySelectorAll('.recovery-issue p')].some(e => e.getClientRects().length && e.textContent.trim() === " + JSONObject.quote(PENDING_MESSAGE) + ")");
    }

    private void assertNoPendingIssue() throws Exception {
        if ("true".equals(web.evaluate("!!document.querySelector('button[data-session-focus=\"issues-summary\"]')"))) {
            web.tap("document.querySelector('button[data-session-focus=\"issues-summary\"]')");
            web.await("Real recovery has no stale pending-storage failure", "!!document.querySelector('[role=dialog]') && ![...document.querySelectorAll('.recovery-issue p')].some(e => e.textContent.trim() === " + JSONObject.quote(PENDING_MESSAGE) + ")");
            web.tap(web.button("Close"));
        }
    }

    private String select(String label) { return "document.querySelector('select[aria-label=" + JSONObject.quote(label) + "]')"; }

    private void awaitPolicy(String label, long expectedValue) throws Exception {
        web.await("Applied " + label + "=" + expectedValue, "(() => {const e=" + select(label)
            + ";return !!e && !e.disabled && e.getAttribute('aria-busy') !== 'true' && e.value === " + JSONObject.quote(String.valueOf(expectedValue)) + ";})()");
    }

    private void selectPolicy(String label, String optionText, long expectedValue) throws Exception {
        web.tap(select(label));
        AccessibilityNodeInfo option = awaitOption(optionText);
        Rect bounds = new Rect();
        option.getBoundsInScreen(bounds);
        assertTrue("Real native option is visible and enabled", option.isVisibleToUser() && option.isEnabled() && !bounds.isEmpty());
        long downAt = SystemClock.uptimeMillis();
        pointer(MotionEvent.ACTION_DOWN, bounds.exactCenterX(), bounds.exactCenterY(), downAt);
        SystemClock.sleep(40);
        pointer(MotionEvent.ACTION_UP, bounds.exactCenterX(), bounds.exactCenterY(), downAt);
        awaitForeground();
        awaitPolicy(label, expectedValue);
        web.await("Actual applied settings save feedback", "[...document.querySelectorAll('.clip-settings [role=status]')].some(e => e.getClientRects().length && e.textContent.trim() === 'Clip settings saved.')");
        assertPolicyNative(label.equals("Clip Sharing Lifetime") ? "sharingLifetimeMs" : "localRetentionMs", expectedValue);
    }

    private void assertPolicyNative(String key, long value) {
        assertEquals("Actual durable native policy corroborates the UI", String.valueOf(value),
            context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString("clipp-android:" + key, null));
    }

    private AccessibilityNodeInfo awaitOption(String text) {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            AccessibilityNodeInfo found = findOption(instrumentation.getUiAutomation().getRootInActiveWindow(), text, 0, new int[] { 1024 });
            if (found != null) return found;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Actual native option unavailable: " + text);
    }

    private AccessibilityNodeInfo findOption(AccessibilityNodeInfo node, String text, int depth, int[] remaining) {
        if (node == null || depth > 32 || --remaining[0] < 0) return null;
        if (node.isVisibleToUser() && text.equals(String.valueOf(node.getText()))
            && "android.widget.CheckedTextView".equals(String.valueOf(node.getClassName()))
            && context.getPackageName().equals(String.valueOf(node.getPackageName()))) return node;
        for (int index = 0; index < Math.min(node.getChildCount(), 128); index++) {
            AccessibilityNodeInfo found = findOption(node.getChild(index), text, depth + 1, remaining);
            if (found != null) return found;
        }
        return null;
    }

    private void pointer(int action, float x, float y, long downAt) {
        MotionEvent event = MotionEvent.obtain(downAt, SystemClock.uptimeMillis(), action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try { assertTrue("Android accepts one original native option gesture", instrumentation.getUiAutomation().injectInputEvent(event, true)); }
        finally { event.recycle(); }
    }

    private void awaitForeground() throws Exception {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            AccessibilityNodeInfo active = instrumentation.getUiAutomation().getRootInActiveWindow();
            if (active != null && context.getPackageName().equals(String.valueOf(active.getPackageName()))) {
                final boolean[] focused = { false };
                web.onActivity(activity -> focused[0] = activity.hasWindowFocus());
                if (focused[0]) return;
            }
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        fail("The actual owning native window did not regain focus");
    }

    private void awaitExternalSettings() {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            AccessibilityNodeInfo active = instrumentation.getUiAutomation().getRootInActiveWindow();
            if (active != null && "com.android.settings".equals(String.valueOf(active.getPackageName()))) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        fail("The actual Android Settings window did not open");
    }

    private JSONObject eventCheckpoint(JSONObject event) throws Exception {
        return new JSONObject(event.toString()).put("nonce", nonce).put("phase", phase).put("marker", marker)
            .put("pid", Process.myPid()).put("mainLaunchAt", mainLaunchAt)
            .put("epochMs", System.currentTimeMillis()).put("uptimeMs", SystemClock.uptimeMillis());
    }

    private JSONObject artifact(String name, JSONObject data) throws Exception {
        byte[] bytes = (data.toString(2) + "\n").getBytes(StandardCharsets.UTF_8);
        assertTrue("Bound owned artifact bytes", bytes.length <= MAX_BYTES);
        File target = new File(directory, name);
        assertTrue("Never overwrite earlier evidence", target.createNewFile());
        try (FileOutputStream output = new FileOutputStream(target)) { output.write(bytes); }
        StringBuilder digest = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) digest.append(String.format("%02x", value & 0xff));
        return new JSONObject().put("path", target.getAbsolutePath()).put("sha256", digest.toString()).put("bytes", bytes.length);
    }

    private String requiredUuid(String name) {
        String value = arguments.getString(name, "");
        assertTrue("Root must supply original checkpoint UUID: " + name, value.matches(UUID));
        return value;
    }

    private long requiredLong(String name) {
        String value = arguments.getString(name, "");
        assertTrue("Root must supply the original safe timestamp: " + name, value.matches("[1-9][0-9]{0,15}"));
        long parsed = Long.parseLong(value);
        assertTrue(parsed <= 9_007_199_254_740_991L);
        return parsed;
    }

    private static String read(InputStream stream, int limit) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = stream.read(buffer)) != -1) {
            assertTrue("Bound input bytes", output.size() + count <= limit);
            output.write(buffer, 0, count);
        }
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private void emit(String stage, JSONObject data) { Log.i(TAG, stage + " " + data); }
}
