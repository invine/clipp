package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Application;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Process;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityEvent;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TestName;
import org.junit.rules.TestWatcher;
import org.junit.runner.Description;
import org.junit.runner.RunWith;

/**
 * Separately invoked phases against the packaged owning entry and ordinary MainActivity.
 * Root captures preflight, reviews its genuine Peer ID, then installs a separately built
 * fixed execute APK without clearing data. No method changes the packaged manifest or
 * invokes reset, storage, native queue or clipboard APIs. Public DOM reads only locate
 * controls and witness the entry; Android supplies all input and lifecycle reconstruction.
 *
 * Root must select one method and pass resetOwningAcceptance=true, resetOwningPhase
 * (preflight/execute/replay), and resetOwningNonce equal to the actual packaged caseId.
 * Replay additionally requires resetOwningGeneratedPeerId and resetOwningFormerDocumentId
 * captured from execute. Activity reconstruction is not whole-process/new-PID evidence.
 * Enabled background preference, credentials, nonempty pending pointers/queues, genuine
 * faults and unchanged/changed guest clipboard intervals remain separate, unqualified cases.
 */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class ResetOverlapEntryInputTest {
    private static final long UI_TIMEOUT_MS = 20_000;
    private static final long WEEK_MS = 604_800_000;
    private static final long HOUR_MS = 3_600_000;
    private static final String TAG = "ClippResetOwning";
    private static final String[] PUBLIC_FIELDS = {"version", "caseId", "documentId", "stage", "operationId",
        "currentPeerId", "formerPeerId", "generatedPeerId", "clipCount", "pinnedCount", "markerMatchCount",
        "autoSync", "theme", "backgroundEnabled", "backgroundStateKnown", "localRetentionMs",
        "sharingLifetimeMs", "historyAvailable", "receiptPresent", "error", "overlapElapsedMs", "overlapRemainingMs"};
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    @Rule public final TestName method = new TestName();
    @Rule public final TestWatcher outcome = new TestWatcher() {
        @Override protected void succeeded(Description description) { report("passed", ""); }
        @Override protected void failed(Throwable failure, Description description) {
            report("failed", failure.getClass().getSimpleName());
        }
    };
    private ActivityScenario<MainActivity> scenario;
    private NativePublicWebView web;
    private Application application;
    private JSONObject manifest;
    private JSONObject lastProgress = new JSONObject();
    private final JSONArray progressTrace = new JSONArray();
    private String nonce;
    private String phase;
    private String expectedGeneratedPeerId;
    private String expectedFormerDocumentId;
    private String manifestSha256;
    private String indexSha256;
    private long launchedAt;
    private int droppedTrace;
    private String previousTrace = "";
    private boolean cleanupComplete;
    private String tapGuardReason = "none";
    private JSONObject continueTap = new JSONObject();
    private JSONObject postFailureProgress = new JSONObject();
    private int journeyCreated;
    private int journeyDestroyed;
    private int retiredPublicReads;
    private final AtomicInteger created = new AtomicInteger();
    private final AtomicInteger destroyed = new AtomicInteger();
    private volatile MainActivity firstActivity;
    private volatile MainActivity resumedActivity;
    private volatile int firstTaskId = -1;
    private final Application.ActivityLifecycleCallbacks lifecycle = new Application.ActivityLifecycleCallbacks() {
        @Override public void onActivityCreated(Activity activity, Bundle state) {
            if (!isOwner(activity)) return;
            if (firstActivity == null) {
                firstActivity = (MainActivity) activity;
                firstTaskId = activity.getTaskId();
            }
            created.incrementAndGet();
        }
        @Override public void onActivityResumed(Activity activity) {
            if (isOwner(activity)) resumedActivity = (MainActivity) activity;
        }
        @Override public void onActivityDestroyed(Activity activity) {
            if (isOwner(activity)) destroyed.incrementAndGet();
        }
        @Override public void onActivityStarted(Activity activity) {}
        @Override public void onActivityPaused(Activity activity) {
            if (activity == resumedActivity) resumedActivity = null;
        }
        @Override public void onActivityStopped(Activity activity) {}
        @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
    };

    @Before
    public void requireRootOptInAndActualPackagedManifestBeforeLaunch() throws Exception {
        Context target = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(target.getPackageName());
        Bundle args = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Root must explicitly own this native interval",
            "true".equals(args.getString("resetOwningAcceptance")));
        String requestedNonce = args.getString("resetOwningNonce", "");
        assertTrue("A bounded unique root nonce is required", requestedNonce.matches("[A-Za-z0-9_-]{1,32}"));
        String requestedPhase = args.getString("resetOwningPhase", "");
        String expectedMethod = "preflight".equals(requestedPhase) ? "prepareSavedPreflightThroughNativeIngressAndOrdinaryUi"
            : "execute".equals(requestedPhase) ? "fixedExecuteReplacesTheActualActivityAndReconcilesItsOperation"
            : "replay".equals(requestedPhase) ? "completedOperationSurvivesAnotherRealActivityReconstruction" : "";
        assertTrue("Invoke exactly the separately declared phase method", !expectedMethod.isEmpty()
            && expectedMethod.equals(method.getMethodName()));
        nonce = requestedNonce;
        phase = requestedPhase;
        if ("replay".equals(phase)) {
            expectedGeneratedPeerId = peerId(args.getString("resetOwningGeneratedPeerId", ""));
            expectedFormerDocumentId = documentId(args.getString("resetOwningFormerDocumentId", ""));
        }
        JSONObject config = new JSONObject(readAsset("capacitor.config.json", 16_384));
        JSONObject server = config.optJSONObject("server");
        assertTrue("Packaged HTTPS assets required; development origin refused", server == null
            || (!server.has("url") && "localhost".equals(server.optString("hostname", "localhost"))
                && "https".equals(server.optString("androidScheme", "https"))));
        String index = readAsset("public/index.html", 16_384);
        indexSha256 = sha(index);
        Matcher embedded = Pattern.compile("<script type=\"application/json\" id=\"clipp-reset-owning-manifest\">([\\s\\S]*?)</script>").matcher(index);
        assertTrue("The actual APK must contain the immutable owning manifest", embedded.find());
        String input = embedded.group(1);
        assertTrue("Packaged manifest must remain bounded", input.getBytes(StandardCharsets.UTF_8).length <= 8192);
        assertTrue("Exactly one packaged owning manifest is permitted", !embedded.find());
        assertTrue("Owning progress output required", index.contains("id=\"clipp-reset-owning-progress\""));
        assertTrue("Storage-only replacement entry refused", !index.contains("__identityResetAcceptance"));
        manifestSha256 = sha(input);
        manifest = new JSONObject(input);
        validateManifest();
        application = (Application) target.getApplicationContext();
        application.registerActivityLifecycleCallbacks(lifecycle);
        launchedAt = SystemClock.uptimeMillis();
        scenario = ActivityScenario.launch(MainActivity.class);
        web = new NativePublicWebView(instrumentation, scenario);
    }

    @After
    public void closeOnlyTheOwnedActivityAndRemoveNativeObserver() throws Exception {
        journeyCreated = created.get();
        journeyDestroyed = destroyed.get();
        try {
            if (web != null) web.closeActivity();
            else if (scenario != null) NativePublicWebView.closeScenarioBounded(scenario);
            else assertTrue("Failed launch left an owned Activity; root cleanup required",
                firstActivity == null || firstActivity.isDestroyed());
            cleanupComplete = true;
        } finally {
            if (application != null) application.unregisterActivityLifecycleCallbacks(lifecycle);
        }
    }

    @Test
    public void prepareSavedPreflightThroughNativeIngressAndOrdinaryUi() throws Exception {
        JSONObject initial = awaitProgress("preflight-ready", launchedAt + manifest.getLong("deadlineMs"));
        assertEquals("Fresh root-owned History required", 0, initial.getInt("clipCount"));
        assertEquals(0, initial.getInt("pinnedCount"));
        assertTrue(initial.getBoolean("backgroundStateKnown"));
        assertTrue("This partial journey does not enable background mode", !initial.getBoolean("backgroundEnabled"));
        openDestination("Settings");
        openSettingsCategory("general");
        select("document.querySelector('select[aria-label=\"Appearance\"]')", "Dark", "dark");
        select("document.querySelector('select#auto-sync')", "Disabled — keep Clips local", "disabled");
        select("document.querySelector('select[aria-label=\"Keep unpinned history\"]')", "7 days", String.valueOf(WEEK_MS));
        openSettingsCategory("advanced");
        select("document.querySelector('select[aria-label=\"Clip Sharing Lifetime\"]')", "1 hour", String.valueOf(HOUR_MS));
        openDestination("Devices");
        tap(web.button("Rename this device"));
        awaitUi("Device Name dialog", "!!document.querySelector('input[aria-label=\"Device Name\"]')");
        tap("document.querySelector('input[aria-label=\"Device Name\"]')");
        awaitIme(true);
        long keys = SystemClock.uptimeMillis();
        for (int action : new int[] {KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP}) {
            KeyEvent event = new KeyEvent(keys, SystemClock.uptimeMillis(), action, KeyEvent.KEYCODE_A, 0, KeyEvent.META_CTRL_ON);
            event.setSource(InputDevice.SOURCE_KEYBOARD);
            instrumentation.sendKeySync(event);
        }
        instrumentation.sendStringSync(deviceName());
        awaitUi("genuine typed name", "document.querySelector('input[aria-label=\"Device Name\"]')?.value === " + JSONObject.quote(deviceName()));
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        awaitIme(false);
        tap(web.button("Save Device Name"));
        awaitUi("saved Device Name", "!document.querySelector('[role=dialog]') && document.querySelector('.peer-item.active .peer-name')?.getAttribute('title') === " + JSONObject.quote(deviceName()));
        openHistory();
        String sendId = nativeIngress(Intent.ACTION_SEND, marker("send"));
        String processId = nativeIngress(Intent.ACTION_PROCESS_TEXT, marker("process"));
        assertNotEquals("Distinct native ingress events retain distinct Clip IDs", sendId, processId);
        tap(card(sendId) + ".querySelector('button[aria-label=\"Pin Clip\"]')");
        awaitUi("real saved pin", "(" + card(sendId) + ")?.querySelector('button[aria-label=\"Pin Clip\"]')?.getAttribute('aria-pressed') === 'true'");
        awaitUi("public preflight reflects saved settings and genuine History", "(() => {const e=document.querySelector('#clipp-reset-owning-progress');if(!e || !e.textContent)return false;const p=JSON.parse(e.textContent);return p.stage==='preflight-ready' && p.clipCount===2 && p.pinnedCount===1 && p.theme==='dark' && p.autoSync===false && p.backgroundStateKnown===true && p.backgroundEnabled===false && p.localRetentionMs===604800000 && p.sharingLifetimeMs===3600000;})()");
        JSONObject prepared = awaitProgress("preflight-ready", SystemClock.uptimeMillis() + UI_TIMEOUT_MS);
        assertEquals(initial.getString("currentPeerId"), prepared.getString("currentPeerId"));
        assertEquals("Only the two genuine native inputs are expected in this partial journey", 2, prepared.getInt("clipCount"));
        assertEquals(1, prepared.getInt("pinnedCount"));
        assertSavedSettings(prepared);
    }

    @Test
    public void fixedExecuteReplacesTheActualActivityAndReconcilesItsOperation() throws Exception {
        long deadline = launchedAt + manifest.getLong("deadlineMs");
        JSONObject first = awaitFirstProgress(deadline);
        assertTrue("The initial execute document must be observed before native replacement",
            created.get() == 1 && destroyed.get() == 0 && !"replacement-ready".equals(first.getString("stage")));
        String formerDocument = first.getString("documentId");
        awaitProgress("provisional-fence-held", deadline);
        assertNativeRefusal(Intent.ACTION_SEND, marker("during-send"));
        assertNativeRefusal(Intent.ACTION_PROCESS_TEXT, marker("during-process"));
        tapContinue(web.button("Continue reset overlap"));
        JSONObject replacement = awaitProgress("replacement-ready", deadline);
        assertReplacement(replacement, 0);
        assertNotEquals("Real Activity recreation must create a new public document", formerDocument, replacement.getString("documentId"));
        assertTrue("The actual reset must destroy its former MainActivity and resume a replacement",
            created.get() == 2 && destroyed.get() == 1 && firstActivity != null && firstActivity.isDestroyed()
                && resumedActivity != null && resumedActivity != firstActivity && resumedActivity.getTaskId() == firstTaskId);
        assertEmptyReplacementUi();
        openHistory();
        assertTrue("Incomplete-reset SEND must not reappear", "0".equals(web.evaluate(matchingCards(marker("during-send")) + ".length")));
        assertTrue("Incomplete-reset PROCESS_TEXT must not reappear", "0".equals(web.evaluate(matchingCards(marker("during-process")) + ".length")));
        String freshId = nativeIngress(Intent.ACTION_SEND, marker("after-send"));
        assertFreshClipSurvivesOwnerRecreation(freshId, deadline);
    }

    private void assertFreshClipSurvivesOwnerRecreation(String freshId, long deadline) throws Exception {
        String formerDocument = lastProgress.getString("documentId");
        String currentPeer = lastProgress.getString("currentPeerId");
        MainActivity formerActivity = resumedActivity;
        scenario.recreate();
        JSONObject reopened = awaitProgress("replacement-ready", deadline);
        assertReplacement(reopened, 1);
        assertEquals("Fresh Clip must remain on the same replacement identity", currentPeer, reopened.getString("currentPeerId"));
        assertNotEquals("Durability check requires a new public document", formerDocument, reopened.getString("documentId"));
        assertTrue("Durability check requires real Activity reconstruction",
            formerActivity != null && formerActivity.isDestroyed() && resumedActivity != null
                && resumedActivity != formerActivity && created.get() == 3 && destroyed.get() == 2);
        openHistory();
        awaitUi("the same fresh Local Clip is visible after native owner recreation",
            matchingCards(marker("after-send")) + ".length === 1 && document.querySelectorAll('.history-card[data-clip-id]').length === 1 && "
                + matchingCards(marker("after-send")) + "[0].getAttribute('data-clip-id') === " + JSONObject.quote(freshId)
                + " && " + matchingCards(marker("after-send")) + "[0].querySelector('.pill-source')?.textContent.trim() === 'Local'");
    }

    private void assertNativeRefusal(String action, String marker) throws Exception {
        Intent input = new Intent(instrumentation.getTargetContext(), ExplicitTextIngressActivity.class)
            .setAction(action).setType("text/plain").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Intent.ACTION_PROCESS_TEXT.equals(action)) input.putExtra(Intent.EXTRA_PROCESS_TEXT, marker).putExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, true);
        else input.putExtra(Intent.EXTRA_TEXT, marker);
        AccessibilityEvent event = instrumentation.getUiAutomation().executeAndWaitForEvent(
            () -> instrumentation.getTargetContext().startActivity(input),
            value -> value.getEventType() == AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED
                && value.getText().toString().contains("Clipp setup is incomplete. Retry sharing after setup finishes."),
            5000);
        event.recycle();
    }

    @Test
    public void completedOperationSurvivesAnotherRealActivityReconstruction() throws Exception {
        long deadline = launchedAt + manifest.getLong("deadlineMs");
        JSONObject first = awaitProgress("replacement-ready", deadline);
        assertReplacement(first, 1);
        assertEquals("Root supplies the previously witnessed candidate, never a refreshed target", expectedGeneratedPeerId, first.getString("currentPeerId"));
        assertNotEquals(expectedFormerDocumentId, first.getString("documentId"));
        assertEquals("Completed replay must not cause another automatic reset recreation", 1, created.get());
        scenario.recreate();
        JSONObject replayed = awaitProgress("replacement-ready", deadline);
        assertReplacement(replayed, 1);
        assertEquals("Same operation must keep the same generated identity", expectedGeneratedPeerId, replayed.getString("currentPeerId"));
        assertNotEquals(first.getString("documentId"), replayed.getString("documentId"));
        assertTrue("Only the explicitly requested real Activity reconstruction is expected", created.get() == 2 && destroyed.get() == 1);
        assertReplacementUiWithFreshClip();
    }

    private void validateManifest() throws Exception {
        boolean preflight = "preflight".equals(phase);
        exactKeys(manifest, preflight ? new String[] {"version", "mode", "caseId", "deadlineMs"}
            : new String[] {"version", "mode", "caseId", "deadlineMs", "operationId", "reviewedPeerId", "expected"});
        assertTrue("Manifest version must be a numeric integer", manifest.get("version") instanceof Number);
        assertEquals(1, manifest.getInt("version"));
        assertEquals(1.0, manifest.getDouble("version"), 0);
        assertEquals(nonce, manifest.getString("caseId"));
        assertEquals(preflight ? "observe-preflight" : "execute", manifest.getString("mode"));
        assertTrue("Deadline must be a numeric integer", manifest.get("deadlineMs") instanceof Number);
        long duration = manifest.getLong("deadlineMs");
        assertEquals((double) duration, manifest.getDouble("deadlineMs"), 0);
        assertTrue("Use the declared bounded entry deadline", duration >= 1000 && duration <= 60_000);
        if (preflight) return;
        assertTrue("Fixed reviewed operation ID required", manifest.getString("operationId").matches("[A-Za-z0-9_-]{1,128}"));
        peerId(manifest.getString("reviewedPeerId"));
        JSONObject expected = manifest.getJSONObject("expected");
        exactKeys(expected, new String[] {"theme", "autoSync", "backgroundEnabled", "localRetentionMs", "sharingLifetimeMs", "markers", "pinnedCount"});
        assertSavedSettings(expected);
        assertTrue("Pin count must be a numeric integer", expected.get("pinnedCount") instanceof Number);
        assertEquals(1.0, expected.getDouble("pinnedCount"), 0);
        JSONArray markers = expected.getJSONArray("markers");
        assertEquals(2, markers.length());
        assertEquals(marker("send"), markers.getString(0));
        assertEquals(marker("process"), markers.getString(1));
    }

    private void assertSavedSettings(JSONObject value) throws Exception {
        assertEquals("dark", value.getString("theme"));
        assertEquals(Boolean.FALSE, value.get("autoSync"));
        assertEquals(Boolean.FALSE, value.get("backgroundEnabled"));
        assertTrue("Applied policies must be numeric", value.get("localRetentionMs") instanceof Number
            && value.get("sharingLifetimeMs") instanceof Number);
        assertEquals((double) WEEK_MS, value.getDouble("localRetentionMs"), 0);
        assertEquals((double) HOUR_MS, value.getDouble("sharingLifetimeMs"), 0);
    }

    private void assertReplacement(JSONObject value, int expectedClipCount) throws Exception {
        assertEquals(manifest.getString("operationId"), value.getString("operationId"));
        assertEquals(manifest.getString("reviewedPeerId"), value.getString("formerPeerId"));
        assertNotEquals(value.getString("formerPeerId"), peerId(value.getString("currentPeerId")));
        assertTrue("Same-operation public completion receipt must be present", value.getBoolean("receiptPresent"));
        assertEquals(expectedClipCount, value.getInt("clipCount"));
        assertEquals(0, value.getInt("pinnedCount"));
        assertEquals("dark", value.getString("theme"));
        assertEquals(Boolean.FALSE, value.get("autoSync"));
        assertEquals(Boolean.TRUE, value.get("backgroundEnabled"));
        assertEquals((double) WEEK_MS, value.getDouble("localRetentionMs"), 0);
        assertEquals((double) HOUR_MS, value.getDouble("sharingLifetimeMs"), 0);
    }

    private void assertEmptyReplacementUi() throws Exception {
        openDestination("Devices");
        awaitUi("platform default replaces the former saved Device Name", "document.querySelector('.peer-item.active .peer-name')?.getAttribute('title') === 'Mobile'");
        openHistory();
        awaitUi("actual loaded empty History is visible", "document.querySelectorAll('.history-card[data-clip-id]').length === 0 && [...document.querySelectorAll('.history-card.history-empty .history-text')].some(e=>e.getClientRects().length && e.textContent.trim()==='No history yet.')");
        assertSavedSettingsUi();
    }

    private void assertReplacementUiWithFreshClip() throws Exception {
        openHistory();
        awaitUi("the one fresh post-reset Local Clip persists", matchingCards(marker("after-send")) + ".length === 1 && document.querySelectorAll('.history-card[data-clip-id]').length === 1 && "
            + matchingCards(marker("after-send")) + "[0].querySelector('.pill-source')?.textContent.trim() === 'Local'");
        assertSavedSettingsUi();
    }

    private void assertSavedSettingsUi() throws Exception {
        openDestination("Settings");
        openSettingsCategory("general");
        awaitUi("General settings survived reset", "document.querySelector('select[aria-label=\"Appearance\"]')?.value === 'dark' && document.querySelector('select#auto-sync')?.value === 'disabled' && document.querySelector('select[aria-label=\"Keep unpinned history\"]')?.value === '604800000'");
        openSettingsCategory("advanced");
        awaitUi("Advanced sharing lifetime survived reset", "document.querySelector('select[aria-label=\"Clip Sharing Lifetime\"]')?.value === '3600000'");
    }

    private void openSettingsCategory(String category) throws Exception {
        assertTrue("Only fixed Settings categories", Arrays.asList("general", "advanced").contains(category));
        tap("document.querySelector('[data-session-focus=\"settings-category:" + category + "\"]')");
        awaitUi("selected Settings category", "document.querySelector('[data-session-focus=\"settings-category:" + category + "\"]')?.getAttribute('aria-current') === 'page'");
    }

    private JSONObject awaitFirstProgress(long deadline) throws Exception {
        do {
            JSONObject progress = readProgress();
            if (progress != null) return progress;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Public entry progress unavailable before declared deadline");
    }

    private JSONObject awaitProgress(String expected, long deadline) throws Exception {
        do {
            JSONObject value = readProgress();
            if (value != null) {
                String stage = value.getString("stage");
                if (expected.equals(stage)) return value;
                assertTrue("Entry reported an unconfirmed or refused outcome: " + stage,
                    ResetOverlapProgressPolicy.isTransient(stage));
            }
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Expected public entry stage was not confirmed before declared deadline: " + expected);
    }

    private JSONObject readProgress() throws Exception {
        if (resumedActivity == null || resumedActivity.isDestroyed()) return null;
        int createdBefore = created.get(), destroyedBefore = destroyed.get();
        String selected;
        try {
            selected = web.evaluate("(() => { const e=document.querySelector('#clipp-reset-owning-progress'); if(!e || e.textContent.length>4096 || !e.textContent) return null;"
                + " const p=JSON.parse(e.textContent), r={}; for(const k of " + new JSONArray(Arrays.asList(PUBLIC_FIELDS))
                + ") if(Object.prototype.hasOwnProperty.call(p,k) && ['string','number','boolean'].includes(typeof p[k]) && (typeof p[k]!=='string' || p[k].length<=512)) r[k]=p[k]; return JSON.stringify({origin:location.origin,progress:r}); })()");
        } catch (Exception | AssertionError failure) {
            // A real owner replacement can retire a queued read. Never reuse its result.
            if (created.get() != createdBefore || destroyed.get() != destroyedBefore || resumedActivity == null) {
                retiredPublicReads++;
                return null;
            }
            throw new AssertionError("Read-only public entry observation unavailable: " + failure.getClass().getSimpleName());
        }
        if ("null".equals(selected)) return null;
        JSONObject observation = new JSONObject(selected);
        assertEquals("Packaged origin must remain HTTPS localhost", "https://localhost", observation.getString("origin"));
        JSONObject value = observation.getJSONObject("progress");
        assertEquals("Bounded public entry version", 1, value.getInt("version"));
        assertEquals("Public observation belongs to the fixed packaged case", nonce, value.getString("caseId"));
        documentId(value.getString("documentId"));
        String trace = value.getString("stage") + ":" + value.getString("documentId");
        if (!trace.equals(previousTrace)) {
            if (progressTrace.length() < 16) {
                JSONObject item = new JSONObject().put("stage", value.getString("stage"))
                    .put("documentId", value.getString("documentId"))
                    .put("observedUptimeMs", SystemClock.uptimeMillis());
                if (value.has("overlapElapsedMs")) item.put("overlapElapsedMs", value.getLong("overlapElapsedMs"));
                if (value.has("overlapRemainingMs")) item.put("overlapRemainingMs", value.getLong("overlapRemainingMs"));
                progressTrace.put(item);
            }
            else droppedTrace++;
            previousTrace = trace;
        }
        lastProgress = value;
        return value;
    }

    private void openDestination(String name) throws Exception {
        tap(web.button(name));
        awaitUi("selected destination", "document.querySelector('nav button[aria-current=\"page\"]')?.textContent.trim() === " + JSONObject.quote(name));
    }

    private void openHistory() throws Exception {
        openDestination("History");
        if (!"true".equals(web.evaluate("!!(" + web.button("All") + ")"))) tap(web.button("Filters"));
        tap(web.button("All"));
        awaitUi("All History is available", "(" + web.button("All") + ")?.getAttribute('aria-pressed') === 'true' && !document.querySelector('[data-session-scroll=\"history\"] .initialization-error') && ![...document.querySelectorAll('[role=status]')].some(e=>e.getClientRects().length && e.textContent.trim()==='Loading History…')");
    }

    private String nativeIngress(String action, String marker) throws Exception {
        awaitUi("fresh native ingress marker", matchingCards(marker) + ".length === 0");
        Intent input = new Intent(instrumentation.getTargetContext(), ExplicitTextIngressActivity.class)
            .setAction(action).setType("text/plain").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Intent.ACTION_PROCESS_TEXT.equals(action)) input.putExtra(Intent.EXTRA_PROCESS_TEXT, marker).putExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, true);
        else input.putExtra(Intent.EXTRA_TEXT, marker);
        instrumentation.getTargetContext().startActivity(input);
        awaitUi("one genuine Local Clip from native ingress", matchingCards(marker) + ".length === 1 && "
            + matchingCards(marker) + "[0].querySelector('.pill-source')?.textContent.trim() === 'Local'");
        String id = web.evaluate(matchingCards(marker) + "[0].getAttribute('data-clip-id')");
        assertTrue("Native input must produce a canonical Clip ID", id.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"));
        return id;
    }

    private void select(String element, String optionText, String value) throws Exception {
        awaitUi("applied select is available", "(() => {const e=" + element + ";return !!e && !e.disabled && e.getAttribute('aria-busy')!=='true' && e.value!=='';})()");
        tap(element);
        long deadline = SystemClock.uptimeMillis() + UI_TIMEOUT_MS;
        AccessibilityNodeInfo option;
        do {
            option = findOption(instrumentation.getUiAutomation().getRootInActiveWindow(), optionText);
            if (option != null) break;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        assertTrue("Real native select option unavailable", option != null);
        Rect bounds = new Rect();
        option.getBoundsInScreen(bounds);
        assertTrue("Real native select option must have visible native geometry", !bounds.isEmpty() && option.isEnabled());
        long down = SystemClock.uptimeMillis();
        pointer(MotionEvent.ACTION_DOWN, bounds.exactCenterX(), bounds.exactCenterY(), down);
        SystemClock.sleep(40);
        pointer(MotionEvent.ACTION_UP, bounds.exactCenterX(), bounds.exactCenterY(), down);
        awaitUi("selected preference is applied", "(() => {const e=" + element + ";return !!e && !e.disabled && e.getAttribute('aria-busy')!=='true' && e.value===" + JSONObject.quote(value) + ";})()");
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
        AccessibilityNodeInfo active = instrumentation.getUiAutomation().getRootInActiveWindow();
        assertTrue("Physical select input requires the isolated active app window", active != null
            && instrumentation.getTargetContext().getPackageName().equals(String.valueOf(active.getPackageName())));
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try { assertTrue("Android must accept real select input", instrumentation.getUiAutomation().injectInputEvent(event, true)); }
        finally { event.recycle(); }
    }

    private void awaitIme(boolean expected) throws Exception {
        AtomicBoolean visible = new AtomicBoolean();
        long deadline = SystemClock.uptimeMillis() + UI_TIMEOUT_MS;
        do {
            web.onActivity(activity -> {
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(activity.getBridge().getWebView());
                assertTrue("Native IME insets must be known", insets != null);
                visible.set(insets.isVisible(WindowInsetsCompat.Type.ime()));
            });
            if (visible.get() == expected) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Native IME state unconfirmed");
    }

    private void awaitUi(String description, String expression) throws Exception {
        long deadline = SystemClock.uptimeMillis() + UI_TIMEOUT_MS;
        do {
            if ("true".equals(web.evaluate(expression))) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Public UI condition unconfirmed: " + description);
    }

    private void tap(String element) throws Exception {
        try { web.tap(element); }
        catch (Exception | AssertionError failure) {
            // Classify only finite source guard literals. Helper timeout diagnostics
            // may contain rendered content, so never expose its message or cause chain.
            tapGuardReason = ResetOverlapTapDiagnostics.classify(failure);
            throw new AssertionError("Physical ordinary UI input unconfirmed: " + failure.getClass().getSimpleName()
                + ";guard=" + tapGuardReason);
        }
    }

    private void tapContinue(String element) throws Exception {
        long started = SystemClock.uptimeMillis();
        MainActivity tapOwner = resumedActivity;
        int createdBeforeTap = created.get(), destroyedBeforeTap = destroyed.get();
        web.enableOverlapReadiness();
        boolean failed = false;
        try { tap(element); }
        catch (Exception | AssertionError original) { failed = true; throw original; }
        finally {
            long finished = SystemClock.uptimeMillis();
            try {
                String dispatch = web.touchTimelineDiagnostics().optString("dispatch", "");
                JSONObject timing = new JSONObject().put("startedUptimeMs", started).put("finishedUptimeMs", finished);
                long down = ResetOverlapTapDiagnostics.dispatchUptime(dispatch, "downSent", finished);
                String stage = ResetOverlapTapDiagnostics.dispatchPhase(dispatch);
                timing.put("dispatchPhase", down >= started || "not-sent".equals(stage) ? stage : "unknown");
                for (String field : new String[] {"downSent", "downReturned", "upSent", "upReturned"}) {
                    long value = ResetOverlapTapDiagnostics.dispatchUptime(dispatch, field, finished);
                    if (value >= started) timing.put(field + "UptimeMs", value);
                }
                timing.put("readiness", web.overlapReadiness());
                timing.put("ownerAtEnd", tapOwner != null && tapOwner == resumedActivity && !tapOwner.isDestroyed()
                    && createdBeforeTap == created.get() && destroyedBeforeTap == destroyed.get() ? "same-resumed" : "changed-or-unavailable");
                continueTap = timing;
            } catch (Throwable ignored) {
                continueTap = new JSONObject();
            }
            web.disableOverlapReadiness();
            if (failed) {
                try { postFailureProgress = observeAfterFailedTap(); }
                catch (Throwable ignored) { postFailureProgress = new JSONObject(); }
            }
        }
    }

    private JSONObject observeAfterFailedTap() {
        final MainActivity owner = resumedActivity;
        final int createdBefore = created.get(), destroyedBefore = destroyed.get();
        final String expectedDocument = lastProgress.optString("documentId", "");
        final long started = SystemClock.uptimeMillis();
        ResetOverlapBoundedObservation.Result<JSONObject> result = ResetOverlapBoundedObservation.read(() -> {
            if (owner == null || owner.isDestroyed() || resumedActivity != owner) return null;
            String selected = web.evaluate("(() => {const e=document.querySelector('#clipp-reset-owning-progress');"
                + "if(!e || !e.textContent || e.textContent.length>4096)return null; const p=JSON.parse(e.textContent);"
                + "const bounded=v=>typeof v==='string' && v.length<=128?v:'';"
                + "return JSON.stringify({origin:location.origin,caseId:bounded(p.caseId),documentId:bounded(p.documentId),"
                + "stage:bounded(p.stage),error:bounded(p.error)});})()");
            if ("null".equals(selected)) return null;
            JSONObject value = new JSONObject(selected);
            if (resumedActivity != owner || owner.isDestroyed() || created.get() != createdBefore || destroyed.get() != destroyedBefore
                || !"https://localhost".equals(value.optString("origin")) || !nonce.equals(value.optString("caseId"))
                || !expectedDocument.equals(value.optString("documentId"))) return null;
            return new JSONObject().put("stage", ResetOverlapTapDiagnostics.publicStage(value.optString("stage")))
                .put("error", ResetOverlapTapDiagnostics.publicError(value.optString("error")))
                .put("observedUptimeMs", SystemClock.uptimeMillis());
        }, 1500);
        try {
            JSONObject safe = new JSONObject().put("startedUptimeMs", started)
                .put("finishedUptimeMs", SystemClock.uptimeMillis());
            if (resumedActivity != owner || (owner != null && owner.isDestroyed())
                || created.get() != createdBefore || destroyed.get() != destroyedBefore)
                return safe.put("status", "owner-changed");
            safe.put("status", result.status);
            if (result.value != null) safe.put("value", result.value);
            return safe;
        } catch (Exception ignored) { return new JSONObject(); }
    }

    private String matchingCards(String marker) {
        return "[...document.querySelectorAll('.history-card')].filter(e=>e.getClientRects().length && e.querySelector('.history-text')?.textContent === " + JSONObject.quote(marker) + ")";
    }
    private String card(String id) { return "document.querySelector('.history-card[data-clip-id=" + JSONObject.quote(id) + "]')"; }
    private String marker(String kind) { return "clipp-reset-" + nonce + "-" + kind; }
    private String deviceName() { return "Owning " + nonce; }
    private boolean isOwner(Activity activity) {
        return activity.getClass() == MainActivity.class
            && "com.clipp.app.acceptance".equals(activity.getPackageName());
    }
    private String peerId(String value) {
        assertTrue("Bounded public Peer ID required", value.matches("[A-Za-z0-9]{20,512}"));
        return value;
    }
    private String documentId(String value) {
        assertTrue("Bounded public document UUID required", value.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"));
        return value;
    }
    private void exactKeys(JSONObject value, String[] expected) {
        Set<String> actual = new HashSet<>();
        java.util.Iterator<String> keys = value.keys();
        while (keys.hasNext()) actual.add(keys.next());
        assertEquals("Only the declared immutable manifest fields are accepted", new HashSet<>(Arrays.asList(expected)), actual);
    }
    private String readAsset(String name, int limit) throws Exception {
        try (InputStream stream = instrumentation.getTargetContext().getAssets().open(name)) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) != -1) {
                bytes.write(buffer, 0, count);
                assertTrue("Packaged acceptance asset exceeds declared bound", bytes.size() <= limit);
            }
            return bytes.toString(StandardCharsets.UTF_8.name());
        }
    }
    private String sha(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder encoded = new StringBuilder();
        for (byte item : digest) encoded.append(String.format(java.util.Locale.ROOT, "%02x", item & 255));
        return encoded.toString();
    }
    private void report(String result, String failureClass) {
        if (nonce == null) return;
        try {
            JSONObject witness = new JSONObject().put("version", 1).put("nonce", nonce).put("phase", phase)
                .put("outcome", result).put("failureClass", failureClass).put("tapGuardReason", tapGuardReason).put("pid", Process.myPid())
                .put("manifestSha256", manifestSha256).put("indexSha256", indexSha256)
                .put("publicProgress", lastProgress).put("progressTrace", progressTrace).put("droppedTrace", droppedTrace)
                .put("continueTap", continueTap).put("postFailureProgress", postFailureProgress)
                .put("journeyCreatedMainActivities", journeyCreated).put("journeyDestroyedMainActivities", journeyDestroyed)
                .put("createdMainActivitiesAfterCleanup", created.get()).put("destroyedMainActivitiesAfterCleanup", destroyed.get())
                .put("retiredPublicReads", retiredPublicReads)
                .put("cleanupComplete", cleanupComplete).put("sendMarkerSha256", sha(marker("send")))
                .put("processMarkerSha256", sha(marker("process"))).put("savedNameSha256", sha(deviceName()));
            String encoded = witness.toString();
            assertTrue("Acceptance witness must remain bounded", encoded.length() <= 8192);
            Bundle status = new Bundle();
            status.putString("clippResetOwningWitness", encoded);
            instrumentation.sendStatus(2, status);
            Log.i(TAG, encoded);
        } catch (Exception failure) {
            throw new AssertionError("Bounded acceptance witness could not be emitted: " + failure.getClass().getSimpleName());
        }
    }
}
