package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

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
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Three separately invoked phases of real policy/History acceptance. Root starts with
 * fresh isolated app data, runs A, records emitted metadata through read-only CDP,
 * force-stops the actual app, then runs B with A's public Clip IDs. C performs cleanup
 * only after root records B's durable restart witness. Never run these as an unordered
 * whole-class suite or clear data between phases. Root passes clipPolicyPhase A/B/C
 * and uses clipPolicyWitnessHoldMs (0..30000, default 0) for a bounded read-only
 * snapshot while the actual WebView remains live. Only the test thread waits.
 *
 * UI actions are physical Android taps; ingress is an actual exported native Intent,
 * not a physical share-chooser selection. No bridge, store, preference, JS value or
 * callback is replaced. Exact capturedAt/shareExpiresAt/firstStoredAt and suppression
 * require root's separate read-only real IndexedDB witness, not DOM inference. Native
 * pending retries, nonpreset custom admission, recipients and OEM behavior are outside
 * this test. Launching production starts normal capture; root owns the guest clipboard
 * and network interval as well as every APK, lifecycle and CDP operation.
 */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class ClipPolicyInputTest {
    private static final long TIMEOUT_MS = 20_000;
    private static final long DAY_MS = 86_400_000;
    private static final long WEEK_MS = 604_800_000;
    private static final String TAG = "ClippClipPolicy";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private ActivityScenario<MainActivity> scenario;
    private NativePublicWebView web;
    private Bundle arguments;
    private String runId;
    private String phase;
    private long witnessHoldMs;

    @Before
    public void requireIsolatedPackagedProductionAndRootInterval() throws Exception {
        Context context = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(context.getPackageName());
        arguments = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Root must opt in with -e clipPolicyAcceptance true",
            "true".equals(arguments.getString("clipPolicyAcceptance")));
        runId = arguments.getString("clipPolicyRunId", "");
        assertTrue("Use the same unique synthetic run ID in separately invoked A/B/C phases",
            runId.matches("[A-Za-z0-9-]{1,32}"));
        phase = arguments.getString("clipPolicyPhase", "");
        assertTrue("Root must name the separately invoked phase A, B or C", phase.matches("[ABC]"));
        String hold = arguments.getString("clipPolicyWitnessHoldMs", "0");
        assertTrue("Read-only observation hold must be an integer from 0 to 30000 ms", hold.matches("[0-9]{1,5}"));
        witnessHoldMs = Long.parseLong(hold);
        assertTrue("Read-only observation hold is bounded to 30 seconds", witnessHoldMs <= 30_000);
        JSONObject config;
        try (InputStream stream = context.getAssets().open("capacitor.config.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
            config = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
        }
        JSONObject server = config.optJSONObject("server");
        assertTrue("Packaged production assets required; dev server refused", server == null || !server.has("url"));
        try (InputStream stream = context.getAssets().open("public/index.html")) {
            assertTrue("Packaged production index required", stream.read() != -1);
        }
        scenario = ActivityScenario.launch(MainActivity.class);
        web = new NativePublicWebView(instrumentation, scenario);
        web.await("packaged workspace ready", "document.querySelector('nav[aria-label=\"Clipp destinations\"]') !== null");
        assertEquals("https://localhost/", web.evaluate("location.origin + '/'"));
    }

    @After
    public void closeOnlyTheIsolatedActivity() {
        if (scenario != null) scenario.close();
    }

    @Test
    public void phaseA_nativeIngressUsesSelectedLifetimeAndPinsSurvivePolicyChange() throws Exception {
        assertEquals("Invoke phase A alone on fresh isolated app data", "A", phase);
        openSettings();
        awaitPolicy("Keep unpinned history", 30 * DAY_MS);
        awaitPolicy("Clip Sharing Lifetime", DAY_MS);
        selectPolicy("Keep unpinned history", "7 days", WEEK_MS);
        selectPolicy("Clip Sharing Lifetime", "1 hour", 3_600_000);
        openHistory("All");
        awaitAbsent(marker("send-hour"));
        awaitAbsent(marker("process-hour"));
        awaitAbsent(marker("send-week"));

        String sendId = nativeIngress(Intent.ACTION_SEND, marker("send-hour"));
        String processId = nativeIngress(Intent.ACTION_PROCESS_TEXT, marker("process-hour"));
        assertNotEquals("Each native event has its own Clip ID", sendId, processId);
        web.tap(card(sendId) + ".querySelector('button[aria-label=\"Pin Clip\"]')");
        awaitPinned(sendId, true);
        openHistory("Pinned");
        assertEquals(sendId, cardId(marker("send-hour")));
        awaitAbsent(marker("process-hour"));

        openSettings();
        selectPolicy("Clip Sharing Lifetime", "7 days", WEEK_MS);
        openHistory("All");
        assertEquals("Policy changes keep existing event IDs", sendId, cardId(marker("send-hour")));
        assertEquals(processId, cardId(marker("process-hour")));
        String laterId = nativeIngress(Intent.ACTION_SEND, marker("send-week"));
        assertNotEquals(sendId, laterId);
        assertNotEquals(processId, laterId);
        awaitPinned(sendId, true);
        awaitPinned(processId, false);
        awaitPinned(laterId, false);
        witness("A", sendId, processId, laterId);
    }

    @Test
    public void phaseB_realProcessRestartRetainsPoliciesEventsAndPin() throws Exception {
        assertEquals("Invoke phase B alone after root force-stop", "B", phase);
        String sendId = expectedId("clipPolicySendId");
        String processId = expectedId("clipPolicyProcessId");
        String laterId = expectedId("clipPolicyLaterId");
        // Root must prove a distinct process boundary; Activity recreation is insufficient.
        String formerPid = arguments.getString("clipPolicyFormerPid", "");
        assertTrue("Root supplies phase A's PID after actual force-stop", formerPid.matches("[0-9]+"));
        assertNotEquals("Phase B must run in a new actual app process", formerPid, String.valueOf(Process.myPid()));
        openSettings();
        awaitPolicy("Keep unpinned history", WEEK_MS);
        awaitPolicy("Clip Sharing Lifetime", WEEK_MS);
        assertSavedPolicies();
        assertRetainedEvents(sendId, processId, laterId);
        witness("B", sendId, processId, laterId);
    }

    @Test
    public void phaseC_zeroRetentionExemptsPinnedClipAndUnpinRemovesItFromCurrentViews() throws Exception {
        assertEquals("Invoke phase C alone after the restart storage witness", "C", phase);
        String sendId = expectedId("clipPolicySendId");
        String processId = expectedId("clipPolicyProcessId");
        String laterId = expectedId("clipPolicyLaterId");
        assertRetainedEvents(sendId, processId, laterId);
        openSettings();
        awaitPolicy("Keep unpinned history", WEEK_MS);
        awaitPolicy("Clip Sharing Lifetime", WEEK_MS);
        selectPolicy("Keep unpinned history", "Remove unpinned history immediately", 0);
        openHistory("All");
        assertEquals(sendId, cardId(marker("send-hour")));
        awaitPinned(sendId, true);
        awaitAbsent(marker("process-hour"));
        awaitAbsent(marker("send-week"));
        openHistory("Pinned");
        assertEquals(sendId, cardId(marker("send-hour")));
        web.tap(card(sendId) + ".querySelector('button[aria-label=\"Pin Clip\"]')");
        awaitAbsent(marker("send-hour"));
        openHistory("All");
        awaitAllMarkersAbsent();
        openSettings();
        selectPolicy("Keep unpinned history", "7 days", WEEK_MS);
        openHistory("All");
        awaitAllMarkersAbsent();
        openHistory("Pinned");
        awaitAllMarkersAbsent();
        witness("C", sendId, processId, laterId);
    }

    private void assertRetainedEvents(String sendId, String processId, String laterId) throws Exception {
        openHistory("All");
        assertEquals(sendId, cardId(marker("send-hour")));
        assertEquals(processId, cardId(marker("process-hour")));
        assertEquals(laterId, cardId(marker("send-week")));
        awaitPinned(sendId, true);
        awaitPinned(processId, false);
        awaitPinned(laterId, false);
        openHistory("Pinned");
        assertEquals(sendId, cardId(marker("send-hour")));
        awaitAbsent(marker("process-hour"));
        awaitAbsent(marker("send-week"));
        openHistory("All");
    }

    private String nativeIngress(String action, String text) throws Exception {
        Context context = instrumentation.getTargetContext();
        Intent intent = new Intent(context, ExplicitTextIngressActivity.class)
            .setAction(action).setType("text/plain").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Intent.ACTION_PROCESS_TEXT.equals(action)) {
            intent.putExtra(Intent.EXTRA_PROCESS_TEXT, text);
            intent.putExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, true);
        } else intent.putExtra(Intent.EXTRA_TEXT, text);
        // Actual exported ingress Activity receives Android's Intent; do not call its
        // onCreate, queue prepare/complete or AndroidClient clipboard methods directly.
        long dispatchedAt = System.currentTimeMillis();
        context.startActivity(intent);
        awaitForeground();
        String id;
        try { id = cardId(text); }
        catch (AssertionError failure) {
            if ("true".equals(arguments.getString("clipPolicyIngressDiagnostic"))) {
                try { logReadOnlyIngressDiagnostic(text); }
                catch (Exception diagnosticFailure) {
                    failure.addSuppressed(diagnosticFailure);
                    Log.i(TAG, "READONLY_INGRESS_DIAGNOSTIC unavailable: " + diagnosticFailure.getClass().getSimpleName());
                }
            }
            throw failure;
        }
        Log.i(TAG, "NATIVE_INTENT_EMITTED " + new JSONObject().put("runId", runId)
            .put("action", action).put("marker", text).put("clipId", id)
            .put("dispatchedAt", dispatchedAt).put("observedAt", System.currentTimeMillis()));
        return id;
    }

    /** Failure-only observation, additionally opted in by root. Never prepares/drains
     * a queue or invokes a plugin handler; the original actual-ingress assertion fails. */
    private void logReadOnlyIngressDiagnostic(String marker) throws Exception {
        NativeAcceptanceTarget.requireIsolated(instrumentation.getTargetContext().getPackageName());
        String raw = instrumentation.getTargetContext()
            .getSharedPreferences("clipp_explicit_text_ingress", Context.MODE_PRIVATE)
            .getString("actions", "[]");
        JSONArray actions = new JSONArray(raw);
        JSONArray matching = new JSONArray();
        for (int index = 0; index < actions.length(); index++) {
            JSONObject action = actions.getJSONObject(index);
            if (!marker.equals(action.optString("text"))) continue;
            JSONObject event = action.optJSONObject("event");
            JSONObject row = new JSONObject().put("source", action.optString("source"))
                .put("prepared", event != null);
            if (event != null) row.put("sharingLifetimeMs", event.opt("sharingLifetimeMs"));
            matching.put(row);
        }
        // Real Android JSON parser + installed Capacitor PluginCall getter. This
        // is a read-only numeric-container witness, never a bridge/handler call.
        JSObject numbers = new JSObject("{\"sharingLifetimeMs\":3600000,\"capturedAt\":1700000000000}");
        PluginCall numericRead = new PluginCall(null, "BackgroundContinuity", "diagnostic", "prepareExplicitTextAction", numbers);
        JSONObject observation = new JSONObject().put("runId", runId).put("marker", marker)
            .put("totalActions", actions.length()).put("matching", matching)
            .put("lifetimeContainer", numbers.opt("sharingLifetimeMs").getClass().getSimpleName())
            .put("capturedAtContainer", numbers.opt("capturedAt").getClass().getSimpleName())
            .put("lifetimeGetLongRejected", numericRead.getLong("sharingLifetimeMs") == null)
            .put("capturedAtGetLongRejected", numericRead.getLong("capturedAt") == null);
        Log.i(TAG, "READONLY_INGRESS_DIAGNOSTIC " + observation);
    }

    private void openSettings() throws Exception {
        web.tap(web.button("Settings"));
        web.await("Settings selected", "document.querySelector('nav button[aria-current=\"page\"]')?.textContent.trim() === 'Settings'");
        web.await("applied policy controls ready", "[...document.querySelectorAll('.clip-settings select')].length === 2 && [...document.querySelectorAll('.clip-settings select')].every(e => !e.disabled && e.value !== '' && e.getAttribute('aria-busy') !== 'true')");
    }

    private void openHistory(String filter) throws Exception {
        web.tap(web.button("History"));
        web.await("History selected", "document.querySelector('nav button[aria-current=\"page\"]')?.textContent.trim() === 'History'");
        if (!"true".equals(web.evaluate("!!(" + web.button(filter) + ")"))) web.tap(web.button("Filters"));
        web.tap(web.button(filter));
        web.await(filter + " History filter applied", "(" + web.button(filter) + ")?.getAttribute('aria-pressed') === 'true'");
        web.await("History available", "!document.querySelector('[data-session-scroll=\"history\"] .initialization-error') && ![...document.querySelectorAll('[role=status]')].some(e => e.getClientRects().length && e.textContent.trim() === 'Loading History…')");
    }

    private String policySelect(String label) {
        return "document.querySelector('select[aria-label=" + JSONObject.quote(label) + "]')";
    }

    private void awaitPolicy(String label, long value) throws Exception {
        web.await("applied " + label + "=" + value, "(() => {const e=" + policySelect(label)
            + ";return !!e && !e.disabled && e.getAttribute('aria-busy') !== 'true' && e.value === " + JSONObject.quote(String.valueOf(value)) + ";})()");
    }

    private void selectPolicy(String label, String optionText, long value) throws Exception {
        web.tap(policySelect(label));
        AccessibilityNodeInfo option = awaitOption(optionText);
        Rect bounds = new Rect();
        option.getBoundsInScreen(bounds);
        assertTrue("Real native select option must be visible and enabled", option.isVisibleToUser() && option.isEnabled() && !bounds.isEmpty());
        long down = SystemClock.uptimeMillis();
        pointer(MotionEvent.ACTION_DOWN, bounds.exactCenterX(), bounds.exactCenterY(), down);
        SystemClock.sleep(40);
        pointer(MotionEvent.ACTION_UP, bounds.exactCenterX(), bounds.exactCenterY(), down);
        instrumentation.waitForIdleSync();
        awaitForeground();
        awaitPolicy(label, value);
        // Read only. The subsequent root force-stop/restart establishes disk persistence.
        String key = label.equals("Clip Sharing Lifetime") ? "sharingLifetimeMs" : "localRetentionMs";
        assertEquals("Applied policy reaches native Preferences", String.valueOf(value),
            instrumentation.getTargetContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
                .getString("clipp-android:" + key, null));
    }

    private void assertSavedPolicies() {
        android.content.SharedPreferences preferences = instrumentation.getTargetContext()
            .getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        assertEquals(String.valueOf(WEEK_MS), preferences.getString("clipp-android:sharingLifetimeMs", null));
        assertEquals(String.valueOf(WEEK_MS), preferences.getString("clipp-android:localRetentionMs", null));
    }

    private AccessibilityNodeInfo awaitOption(String text) {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            AccessibilityNodeInfo option = findOption(instrumentation.getUiAutomation().getRootInActiveWindow(), text);
            if (option != null) return option;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Native select did not show option: " + text);
    }

    private AccessibilityNodeInfo findOption(AccessibilityNodeInfo node, String text) {
        if (node == null) return null;
        if (node.isVisibleToUser() && text.equals(String.valueOf(node.getText()))
            && "android.widget.CheckedTextView".equals(String.valueOf(node.getClassName()))
            && instrumentation.getTargetContext().getPackageName().equals(String.valueOf(node.getPackageName()))) return node;
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo found = findOption(node.getChild(index), text);
            if (found != null) return found;
        }
        return null;
    }

    private void pointer(int action, float x, float y, long down) {
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try { instrumentation.sendPointerSync(event); }
        finally { event.recycle(); }
    }

    private String marker(String kind) { return "clip-policy-" + runId + "-" + kind; }

    private String matchingCards(String text) {
        return "[...document.querySelectorAll('.history-card')].filter(e => e.getClientRects().length && e.querySelector('.history-text')?.textContent === " + JSONObject.quote(text) + ")";
    }

    private String cardId(String text) throws Exception {
        web.await("one retained local native Clip " + text, matchingCards(text) + ".length === 1 && "
            + matchingCards(text) + "[0].querySelector('.pill-source')?.textContent.trim() === 'Local'");
        String id = web.evaluate(matchingCards(text) + "[0].getAttribute('data-clip-id')");
        assertTrue("Rendered native Clip has canonical UUID", id.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"));
        return id;
    }

    private String card(String id) { return "document.querySelector('.history-card[data-clip-id=" + JSONObject.quote(id) + "]')"; }

    private void awaitPinned(String id, boolean pinned) throws Exception {
        web.await("applied Clip pin=" + pinned, "(" + card(id) + ")?.querySelector('button[aria-label=\"Pin Clip\"]')?.getAttribute('aria-pressed') === " + JSONObject.quote(String.valueOf(pinned)));
    }

    private void awaitAbsent(String text) throws Exception { web.await("Clip absent from current view " + text, matchingCards(text) + ".length === 0"); }

    private void awaitAllMarkersAbsent() throws Exception {
        awaitAbsent(marker("send-hour"));
        awaitAbsent(marker("process-hour"));
        awaitAbsent(marker("send-week"));
    }

    private String expectedId(String name) {
        String id = arguments.getString(name, "");
        assertTrue("Root must pass phase A's public Clip ID in " + name,
            id.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"));
        return id;
    }

    private void awaitForeground() {
        AtomicBoolean focused = new AtomicBoolean();
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            scenario.onActivity(activity -> focused.set(activity.hasWindowFocus() && !activity.isFinishing()));
            if (focused.get()) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        assertTrue("Production MainActivity must regain native focus", focused.get());
    }

    private void witness(String phase, String sendId, String processId, String laterId) throws Exception {
        JSONObject result = new JSONObject().put("phase", phase).put("runId", runId)
            .put("pid", Process.myPid()).put("sendId", sendId).put("processId", processId).put("laterId", laterId);
        Log.i(TAG, "READY_READONLY_WITNESS " + result.put("holdMs", witnessHoldMs));
        // Root reads actual IndexedDB with CDP during this bounded observation
        // interval. No test state, app state, file or bridge is written for it.
        if (witnessHoldMs > 0) SystemClock.sleep(witnessHoldMs);
        Log.i(TAG, "COMPLETED_READONLY_WITNESS " + result);
    }
}
