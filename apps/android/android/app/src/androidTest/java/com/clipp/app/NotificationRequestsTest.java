package com.clipp.app;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.system.StructPollfd;
import android.util.Log;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import androidx.core.app.NotificationManagerCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.List;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Rule;
import org.junit.rules.TestName;
import org.junit.Test;
import org.junit.runner.RunWith;

/** First genuine-request chain only. Root owns the actual peer, reverse mapping,
 * isolated guest, permission and clipboard isolation interval. No test notification,
 * PendingIntent invocation, private runtime access or in-app test bridge exists here. */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class NotificationRequestsTest {
    private static final String TAG = "ClippNotification16";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private ActivityScenario<MainActivity> scenario;
    private NativePublicWebView web;
    private String nonce, peerId, peerName, target;
    @Rule public final TestName testName = new TestName();
    private boolean windowedRootSelection;
    private long windowedJourneyEnd;
    private MainActivity windowedOwner;
    private android.webkit.WebView windowedWebView;
    private String windowedTimeOrigin;

    @Before
    public void requireFreshRootAssignedGenuinePeer() throws Exception {
        Context context = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(context.getPackageName());
        Bundle args = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Explicit root genuine notification interval required",
            "true".equals(args.getString("notificationGenuinePeerAcceptance")));
        String windowed = args.getString("notificationWindowedRootSelection", "false");
        assertTrue("Only explicit separate root CUA selection", windowed.equals("true") || windowed.equals("false"));
        windowedRootSelection = windowed.equals("true");
        assertEquals("The root CUA route has its own explicitly assigned method", windowedRootSelection,
            testName.getMethodName().equals("genuinePeerNotificationWindowedRootSelectionAndBackRestoresDirtyPaste"));
        if (windowedRootSelection) {
            for (String diagnostic : new String[]{"notificationWindowCensus", "notificationInteractiveWindowCensus",
                "notificationLocalNodeComparison", "notificationFixedResourceFields"})
                assertEquals("Root CUA selection is separate from AX/diagnostic routes", "false", args.getString(diagnostic, "false"));
            windowedJourneyEnd = SystemClock.uptimeMillis() + 150_000;
        }
        String localComparison = args.getString("notificationLocalNodeComparison", "false");
        assertTrue("Only explicit local-node diagnostics", localComparison.equals("true") || localComparison.equals("false"));
        assertTrue("Local-node diagnostics require the owned interactive census", !localComparison.equals("true")
            || ("true".equals(args.getString("notificationWindowCensus")) && "true".equals(args.getString("notificationInteractiveWindowCensus"))));
        String fixedFields = args.getString("notificationFixedResourceFields", "false");
        assertTrue("Only explicit fixed-field diagnostics", fixedFields.equals("true") || fixedFields.equals("false"));
        assertTrue("Fixed fields require a separate owned interactive census mode", !fixedFields.equals("true")
            || (!localComparison.equals("true") && "true".equals(args.getString("notificationWindowCensus"))
                && "true".equals(args.getString("notificationInteractiveWindowCensus"))));
        nonce = args.getString("notificationRootNonce", "");
        peerId = args.getString("notificationPeerId", "");
        peerName = args.getString("notificationPeerName", "");
        target = args.getString("notificationPeerTarget", "");
        assertTrue("Bounded root nonce required", nonce.matches("[A-Za-z0-9_-]{16,64}"));
        assertTrue("Actual synthetic peer identity required", peerId.matches("[A-Za-z0-9]{32,128}"));
        assertEquals("Peer name must bind the fresh root nonce", "Notif " + nonce.substring(0, 16), peerName);
        assertTrue("Public signed target required", target.startsWith("clipp:pair:") && target.length() <= 65536);
        JSONObject config;
        try (InputStream stream = context.getAssets().open("capacitor.config.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
            config = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
        }
        JSONObject server = config.optJSONObject("server");
        assertTrue("Ordinary packaged app required", server == null || !server.has("url"));
        assertTrue("Root must establish applicable real notification permission",
            NotificationManagerCompat.from(context).areNotificationsEnabled());
        scenario = ActivityScenario.launch(MainActivity.class);
        web = new NativePublicWebView(instrumentation, scenario);
        web.await("actual workspace ready", "document.querySelector('nav[aria-label=\"Clipp destinations\"]') !== null");
        assertEquals("Ordinary packaged origin required", "https://localhost/", web.evaluate("location.origin + '/'"));
    }

    @After
    public void closeOnlyOwnedActivity() throws Exception {
        if (scenario != null) NativePublicWebView.closeScenarioBounded(scenario);
    }

    @Test
    public void genuinePeerNotificationSelectsCurrentRequestsAndBackRestoresDirtyPaste() throws Exception {
        web.tap(web.button("Devices"));
        web.tap(web.button("Pair this device"));
        web.tap(web.button("Paste pairing text"));
        String textarea = "document.querySelector('textarea[aria-label=\"Pairing text\"]')";
        web.tap(textarea);
        instrumentation.sendStringSync(target);
        web.await("actual public target entered", textarea + ".value === " + JSONObject.quote(target));
        web.tap(web.button("Submit pairing text"));
        web.await("actual outgoing signed request submitted", "[...document.querySelectorAll('[role=status]')].some(e => e.textContent === 'Request submitted. Waiting for approval.')");
        String draft = "retained notification draft " + nonce;
        web.tap(textarea);
        instrumentation.sendStringSync(draft);
        web.await("new dirty editor retained", textarea + ".value === " + JSONObject.quote(draft));
        // Root waits for this public stage AND the peer's verified incoming ID,
        // then invokes only the peer's bounded public requestIncoming operation.
        Log.i(TAG, "awaiting-genuine-reverse-request nonce=" + nonce);
        StatusBarNotification posted = awaitOwnPeerNotification();
        Log.i(TAG, "posted-metadata nonce=" + nonce + " package=" + safeMetadata(posted.getPackageName())
            + " id=" + posted.getId() + " channel=" + safeMetadata(posted.getNotification().getChannelId()));
        logOwnNotificationEligibility("posted", posted);
        assertEquals("Pairing channel, not continuity", "default", posted.getNotification().getChannelId());
        assertEquals("Arrival alone cannot replace dirty editor", draft, web.evaluate(textarea + ".value"));
        assertEquals("Arrival keeps the task visible", "Paste pairing text", web.evaluate(
            "(() => { const d=document.querySelector('[role=dialog][aria-modal=true]'); return d ? document.getElementById(d.getAttribute('aria-labelledby'))?.textContent : null; })()"));
        expandNotificationsWithCompletionWitness();
        try {
            tapActualPeerNotification();
        } catch (AssertionError | RuntimeException failure) {
            try {
                holdFailureScreenBeforeActivityCleanup(failure);
            } catch (Throwable diagnostic) {
                retainRowFailureDiagnostic(failure, diagnostic, "screen-window");
            }
            try {
                logOwnNotificationEligibility("row-failure", posted);
            } catch (Throwable diagnostic) {
                retainRowFailureDiagnostic(failure, diagnostic, "own-eligibility");
            }
            throw failure;
        }
        String card = "[...document.querySelectorAll('.pending-card')].find(e => e.querySelector('.peer-sub')?.getAttribute('title') === " + JSONObject.quote(peerId) + ")";
        web.await("actual authoritative Requests after OS selection", "document.querySelector('h1')?.textContent === 'Requests' && !!(" + card + ") && !document.querySelector('[role=dialog][aria-modal=true]')");
        web.await("current request remains unadmitted", "[...(" + card + ").querySelectorAll('button')].some(e => e.textContent.trim() === 'Accept' && !e.disabled)");
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        web.await("normal native Back restores same dirty editor", "!!(" + textarea + ") && " + textarea + ".value === " + JSONObject.quote(draft));
        Log.i(TAG, "genuine-notification-requests-back-pass nonce=" + nonce + " notificationId=" + posted.getId());
    }

    @Test
    public void genuinePeerNotificationWindowedRootSelectionAndBackRestoresDirtyPaste() throws Exception {
        web.onActivity(activity -> { windowedOwner = activity; windowedWebView = activity.getBridge().getWebView(); });
        windowedTimeOrigin = web.evaluate("performance.timeOrigin");
        web.tap(web.button("Devices"));
        web.tap(web.button("Pair this device"));
        web.tap(web.button("Paste pairing text"));
        String textarea = "document.querySelector('textarea[aria-label=\"Pairing text\"]')";
        web.tap(textarea);
        instrumentation.sendStringSync(target);
        web.await("actual public target entered", textarea + ".value === " + JSONObject.quote(target));
        web.tap(web.button("Submit pairing text"));
        web.await("actual outgoing signed request submitted", "[...document.querySelectorAll('[role=status]')].some(e => e.textContent === 'Request submitted. Waiting for approval.')");
        String draft = "retained notification draft " + nonce;
        web.tap(textarea);
        instrumentation.sendStringSync(draft);
        web.await("new dirty editor retained", textarea + ".value === " + JSONObject.quote(draft));
        // Root waits for this public stage AND the peer's verified incoming ID,
        // then invokes only the peer's bounded public requestIncoming operation.
        Log.i(TAG, "awaiting-genuine-reverse-request nonce=" + nonce);
        StatusBarNotification posted = awaitOwnPeerNotification();
        Log.i(TAG, "posted-metadata nonce=" + nonce + " package=" + safeMetadata(posted.getPackageName())
            + " id=" + posted.getId() + " channel=" + safeMetadata(posted.getNotification().getChannelId()));
        logOwnNotificationEligibility("posted", posted);
        assertEquals("Pairing channel, not continuity", "default", posted.getNotification().getChannelId());
        assertEquals("Arrival alone cannot replace dirty editor", draft, web.evaluate(textarea + ".value"));
        assertEquals("Arrival keeps the task visible", "Paste pairing text", web.evaluate(
            "(() => { const d=document.querySelector('[role=dialog][aria-modal=true]'); return d ? document.getElementById(d.getAttribute('aria-labelledby'))?.textContent : null; })()"));
        expandNotificationsWithCompletionWitness();
        awaitWindowedRootSelection(posted, textarea, draft);
        String card = "[...document.querySelectorAll('.pending-card')].find(e => e.querySelector('.peer-sub')?.getAttribute('title') === " + JSONObject.quote(peerId) + ")";
        web.await("actual authoritative Requests after OS selection", "document.querySelector('h1')?.textContent === 'Requests' && !!(" + card + ") && !document.querySelector('[role=dialog][aria-modal=true]')");
        web.await("current request remains unadmitted", "[...(" + card + ").querySelectorAll('button')].some(e => e.textContent.trim() === 'Accept' && !e.disabled)");
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        web.await("normal native Back restores same dirty editor", "!!(" + textarea + ") && " + textarea + ".value === " + JSONObject.quote(draft));
        assertTrue("Original150s method boundary remains authoritative", SystemClock.uptimeMillis() < windowedJourneyEnd);
        Log.i(TAG, "genuine-windowed-notification-requests-back-pass nonce=" + nonce + " notificationId=" + posted.getId()
            + " completedUptimeMs=" + SystemClock.uptimeMillis());
    }

    private void assertWindowedRootOwner() throws Exception {
        java.util.concurrent.atomic.AtomicBoolean same = new java.util.concurrent.atomic.AtomicBoolean();
        web.onActivity(activity -> same.set(activity == windowedOwner && activity.getBridge() != null
            && activity.getBridge().getWebView() == windowedWebView && !activity.isFinishing() && !activity.isDestroyed()));
        assertTrue("Root selection must retain the original normal Activity and WebView", same.get());
        assertEquals("Root selection must retain the original document", windowedTimeOrigin, web.evaluate("performance.timeOrigin"));
        assertTrue("Original150s method boundary remains authoritative", SystemClock.uptimeMillis() < windowedJourneyEnd);
    }

    private void awaitWindowedRootSelection(StatusBarNotification posted, String textarea, String draft) throws Exception {
        assertTrue("Separate explicit root CUA route required", windowedRootSelection);
        assertWindowedRootOwner();
        assertEquals("The original dirty task remains until a real OS selection", draft, web.evaluate(textarea + ".value"));
        assertEquals("The original task remains until a real OS selection", "Paste pairing text", web.evaluate(
            "(() => { const d=document.querySelector('[role=dialog][aria-modal=true]'); return d ? document.getElementById(d.getAttribute('aria-labelledby'))?.textContent : null; })()"));
        Context context = instrumentation.getTargetContext();
        assertEquals("Own delivered notification only", context.getPackageName(), posted.getPackageName());
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        int matching = 0;
        for (StatusBarNotification current : manager.getActiveNotifications()) {
            if (current.getId() != posted.getId() || !current.getPackageName().equals(posted.getPackageName())
                || !java.util.Objects.equals(current.getTag(), posted.getTag())) continue;
            matching++;
            Notification notification = current.getNotification();
            assertEquals("Own Pairing channel remains current", "default", notification.getChannelId());
            assertEquals("Own Pairing title remains current", "Pairing request", String.valueOf(notification.extras.getCharSequence(Notification.EXTRA_TITLE, "")));
            String body = notification.extras.getString(Notification.EXTRA_TEXT, "");
            assertTrue("Own current notification identifies the exact genuine peer", body.contains(peerName) && body.contains(peerId));
            assertNotNull("Own real notification content route exists", notification.contentIntent);
        }
        assertEquals("Exactly the same own notification remains active at readiness", 1, matching);
        long ready = SystemClock.uptimeMillis();
        long end = Math.min(windowedJourneyEnd, ready + 60_000);
        long readyElapsed = SystemClock.elapsedRealtime();
        long endElapsed = readyElapsed + (end - ready);
        assertTrue("A bounded original manual selection budget remains", end > ready);
        JSONObject metadata = new JSONObject().put("kind", "ROOT_NOTIFICATION16_WINDOWED_SELECTION_READY")
            .put("nonce", nonce).put("package", posted.getPackageName()).put("notificationId", posted.getId())
            .put("channel", "default").put("peerId", peerId).put("peerName", peerName)
            .put("appPid", android.os.Process.myPid()).put("appUid", android.os.Process.myUid())
            .put("task", "Paste pairing text").put("route", "LIVE_CUA_SYSTEMUI_BODY")
            .put("readyUptimeMs", ready).put("expiresUptimeMs", end).put("maximumManualSelectionMs", 60_000)
            .put("readyElapsedRealtimeMs", readyElapsed).put("expiresElapsedRealtimeMs", endElapsed);
        assertTrue("Bounded known readiness fields only", metadata.toString().getBytes(StandardCharsets.UTF_8).length <= 4096);
        Log.i(TAG, "root-selection-ready nonce=" + nonce + " metadata=" + metadata);
        String card = "[...document.querySelectorAll('.pending-card')].find(e => e.querySelector('.peer-sub')?.getAttribute('title') === " + JSONObject.quote(peerId) + ")";
        String actualRequests = "document.querySelector('h1')?.textContent === 'Requests' && !!(" + card + ") && !document.querySelector('[role=dialog][aria-modal=true]')";
        do {
            assertTrue("The one manual selection interval never refreshes", SystemClock.uptimeMillis() < end && SystemClock.elapsedRealtime() < endElapsed);
            assertWindowedRootOwner();
            boolean selected = "true".equals(web.evaluate(actualRequests));
            long observed = SystemClock.uptimeMillis();
            assertTrue("Late public Requests cannot satisfy root selection", observed < end && SystemClock.elapsedRealtime() < endElapsed);
            if (selected) {
                Log.i(TAG, "root-selection-observed nonce=" + nonce + " notificationId=" + posted.getId() + " observedUptimeMs=" + observed
                    + " observedElapsedRealtimeMs=" + SystemClock.elapsedRealtime());
                return;
            }
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        throw new AssertionError("Actual authoritative Requests required after one live CUA SystemUI body selection");
    }

    // Failure observation only: no retry, input, expansion, selector or success authority.
    // Root may take one bounded screenshot while this finite window remains READY.
    private void holdFailureScreenBeforeActivityCleanup(Throwable original) throws Exception {
        Context context = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(context.getPackageName());
        File phase = new File(context.getCacheDir(), "notification16-row-failure-" + nonce + ".phase");
        long started = SystemClock.uptimeMillis();
        long end = started + 3000;
        boolean ready = false;
        try {
            publishFailureScreenPhase(phase, "READY", true);
            ready = true;
            Log.i(TAG, "row-failure-screen-ready nonce=" + nonce
                + " startedUptimeMs=" + started + " holdDeadlineUptimeMs=" + end + " maximumHoldMs=3000");
            try {
                if ("true".equals(InstrumentationRegistry.getArguments().getString("notificationWindowCensus"))) {
                    logFailureWindowCensus(original, end);
                }
            } catch (Throwable diagnostic) {
                retainRowFailureDiagnostic(original, diagnostic, "window-census");
            }
            long remaining;
            while ((remaining = end - SystemClock.uptimeMillis()) > 0) SystemClock.sleep(Math.min(50, remaining));
        } finally {
            if (ready) {
                // Successful END is required by root before any READY-timed image qualifies.
                // If this transition fails, stale READY never proves pre-@After timing.
                publishFailureScreenPhase(phase, "ENDED", false);
                Log.i(TAG, "row-failure-screen-ended nonce=" + nonce
                    + " endedUptimeMs=" + SystemClock.uptimeMillis() + " phaseCommitted=true");
            }
        }
    }

    // Failure-only public observations. No result is returned to the click path.
    private static final class WindowCensus {
        final long start = SystemClock.uptimeMillis();
        final long end;
        final List<AccessibilityNodeInfo> roots = new ArrayList<>();
        final List<List<AccessibilityNodeInfo>> results = new ArrayList<>();
        List<AccessibilityWindowInfo> windows;
        int queries;
        boolean timeCapped, windowCapped, rootCapped, resultCapped, capabilityMissing, scopeUnknown;
        Throwable cleanupFailure;
        UiAutomation configuredAutomation;
        int originalFlags, originalCapabilities, expectedFlags;
        boolean serviceObserved, flagWriteAttempted, serviceDrift, serviceRestored;
        Throwable serviceFailure;
        final JSONObject serviceMetadata = new JSONObject();
        WindowCensus(long holdEnd) { end = Math.min(holdEnd, start + 100); }
        void check() {
            if (SystemClock.uptimeMillis() >= end) { timeCapped = true; throw new ProbeLimit(); }
        }
        <T> T read(ProbeRead<T> operation) {
            check();
            T result = operation.read();
            check();
            return result;
        }
        AccessibilityNodeInfo root(ProbeRead<AccessibilityNodeInfo> operation) {
            check();
            AccessibilityNodeInfo result = operation.read();
            if (result != null) roots.add(result); // Own late acquisitions before checking time.
            check();
            if (result == null) scopeUnknown = true;
            return result;
        }
        List<AccessibilityNodeInfo> query(AccessibilityNodeInfo root, String value) {
            check();
            if (queries >= 7) { throw new ProbeLimit(); }
            queries++;
            List<AccessibilityNodeInfo> result = root.findAccessibilityNodeInfosByText(value);
            results.add(result);
            check();
            if (result == null) { scopeUnknown = true; throw new ProbeLimit(); }
            if (result.size() > 4) { resultCapped = true; throw new ProbeLimit(); }
            return result;
        }
        List<AccessibilityNodeInfo> queryId(AccessibilityNodeInfo root, String id) {
            check();
            if (queries >= 7) { throw new ProbeLimit(); }
            queries++;
            List<AccessibilityNodeInfo> result = root.findAccessibilityNodeInfosByViewId(id);
            results.add(result); // Own the entire late/over-cap list before refusal.
            check();
            if (result == null) { scopeUnknown = true; throw new ProbeLimit(); }
            if (result.size() > 4) { resultCapped = true; throw new ProbeLimit(); }
            return result;
        }
        void recycleAll() {
            IdentityHashMap<AccessibilityNodeInfo, Boolean> nodes = new IdentityHashMap<>();
            for (List<AccessibilityNodeInfo> list : results) if (list != null) {
                for (AccessibilityNodeInfo node : list) recycleNode(node, nodes);
            }
            for (AccessibilityNodeInfo node : roots) recycleNode(node, nodes);
            IdentityHashMap<AccessibilityWindowInfo, Boolean> seen = new IdentityHashMap<>();
            if (windows != null) for (AccessibilityWindowInfo window : windows) {
                if (window != null && seen.put(window, true) == null) {
                    try { window.recycle(); }
                    catch (Throwable failure) { if (cleanupFailure == null) cleanupFailure = failure; }
                }
            }
            if (SystemClock.uptimeMillis() >= end) timeCapped = true;
        }
        void recycleNode(AccessibilityNodeInfo node, IdentityHashMap<AccessibilityNodeInfo, Boolean> seen) {
            if (node != null && seen.put(node, true) == null) {
                try { node.recycle(); }
                catch (Throwable failure) { if (cleanupFailure == null) cleanupFailure = failure; }
            }
        }
        boolean incomplete() {
            return timeCapped || windowCapped || rootCapped || resultCapped || capabilityMissing || scopeUnknown
                || cleanupFailure != null || serviceDrift || serviceFailure != null || (serviceObserved && !serviceRestored);
        }
    }

    private void beginInteractiveWindowObservation(WindowCensus census) throws Exception {
        // Separate opt-in: the original already-enabled-only census remains available.
        if (!"true".equals(InstrumentationRegistry.getArguments().getString("notificationInteractiveWindowCensus"))) return;
        census.configuredAutomation = census.read(instrumentation::getUiAutomation);
        AccessibilityServiceInfo service = census.read(census.configuredAutomation::getServiceInfo);
        if (service == null) { census.capabilityMissing = true; return; }
        census.originalFlags = service.flags;
        census.originalCapabilities = service.getCapabilities();
        census.expectedFlags = service.flags | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        census.serviceObserved = true;
        census.serviceMetadata.put("beforeFlags", census.originalFlags).put("beforeCapabilities", census.originalCapabilities)
            .put("expectedDuringFlags", census.expectedFlags).put("ownedBit", AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS);
        census.check();
        if ((census.originalCapabilities & AccessibilityServiceInfo.CAPABILITY_CAN_RETRIEVE_WINDOW_CONTENT) == 0) {
            census.capabilityMissing = true; return; // No service capability is granted.
        }
        // Re-read immediately before the one owned-bit write; never adopt a changed baseline.
        AccessibilityServiceInfo current = census.read(census.configuredAutomation::getServiceInfo);
        if (current == null || current.flags != census.originalFlags || current.getCapabilities() != census.originalCapabilities) {
            census.serviceDrift = true;
            throw new IllegalStateException("UiAutomation service changed before owned-bit observation");
        }
        if (current.flags != census.expectedFlags) {
            current.flags = census.expectedFlags;
            census.flagWriteAttempted = true; // Restoration owns even a throwing/late setServiceInfo call.
            census.configuredAutomation.setServiceInfo(current);
            census.check();
        }
        AccessibilityServiceInfo during = census.configuredAutomation.getServiceInfo();
        if (during != null) census.serviceMetadata.put("duringFlags", during.flags).put("duringCapabilities", during.getCapabilities());
        census.check();
        if (during == null || during.flags != census.expectedFlags || during.getCapabilities() != census.originalCapabilities) {
            census.serviceDrift = true;
            throw new IllegalStateException("UiAutomation owned-bit readback did not match");
        }
        census.serviceMetadata.put("duringVerified", true);
    }

    private void restoreInteractiveWindowObservation(WindowCensus census) {
        if (!census.serviceObserved) return;
        // Cleanup cannot be skipped by the observation deadline. Preserve changed
        // unowned bits rather than clobbering them; any drift remains UNKNOWN.
        try {
            AccessibilityServiceInfo current = census.configuredAutomation.getServiceInfo();
            if (current == null) throw new IllegalStateException("UiAutomation service unavailable for restoration");
            int bit = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
            census.serviceMetadata.put("restoreEntryFlags", current.flags).put("restoreEntryCapabilities", current.getCapabilities());
            if ((current.flags & ~bit) != (census.originalFlags & ~bit) || current.getCapabilities() != census.originalCapabilities) {
                census.serviceDrift = true;
            }
            int restoredFlags = (current.flags & ~bit) | (census.originalFlags & bit);
            if (current.flags != restoredFlags) {
                current.flags = restoredFlags;
                census.configuredAutomation.setServiceInfo(current);
            }
            AccessibilityServiceInfo after = census.configuredAutomation.getServiceInfo();
            if (after != null) census.serviceMetadata.put("afterFlags", after.flags).put("afterCapabilities", after.getCapabilities());
            census.serviceRestored = after != null && after.flags == census.originalFlags
                && after.getCapabilities() == census.originalCapabilities;
            if (!census.serviceRestored || census.serviceDrift) throw new IllegalStateException("UiAutomation restoration or unowned state is unconfirmed");
        } catch (Throwable failure) {
            census.serviceFailure = failure;
        } finally {
            if (SystemClock.uptimeMillis() >= census.end) census.timeCapped = true;
            try {
                census.serviceMetadata.put("writeAttempted", census.flagWriteAttempted).put("restoredVerified", census.serviceRestored)
                    .put("unownedStateDrift", census.serviceDrift).put("restoreError", census.serviceFailure != null);
            } catch (Throwable failure) { if (census.serviceFailure == null) census.serviceFailure = failure; }
        }
    }

    private String censusPackage(AccessibilityNodeInfo root, WindowCensus census, String ownPackage) {
        String value = String.valueOf(census.read(root::getPackageName));
        if (ownPackage.equals(value)) return "own";
        if ("com.android.systemui".equals(value)) return "SystemUI";
        return "android".equals(value) ? "android" : "other";
    }

    private JSONObject censusRootMetadata(AccessibilityNodeInfo root, WindowCensus census, String packageKind)
            throws Exception {
        JSONObject result = new JSONObject();
        result.put("windowId", census.read(root::getWindowId));
        result.put("package", packageKind);
        String className = String.valueOf(census.read(root::getClassName));
        result.put("class", className.startsWith("android.") || className.startsWith("com.android.systemui.")
            || className.startsWith("com.android.internal.") ? safeMetadata(className) : "<other>");
        String id = census.read(root::getViewIdResourceName);
        result.put("resourceId", knownTargetId(id) ? id : "<other>");
        result.put("childCount", census.read(root::getChildCount));
        result.put("visible", census.read(root::isVisibleToUser));
        result.put("enabled", census.read(root::isEnabled));
        return result;
    }

    private JSONObject censusExactQuery(AccessibilityNodeInfo root, WindowCensus census, String expected,
            boolean literalTitle) throws Exception {
        List<AccessibilityNodeInfo> matches = census.query(root, expected);
        int fullMatches = 0, visible = 0;
        for (AccessibilityNodeInfo match : matches) {
            if (match == null) { census.scopeUnknown = true; continue; }
            CharSequence value = census.read(match::getText);
            boolean full = value != null && (literalTitle ? expected.contentEquals(value) : value.toString().contains(expected));
            if (full) {
                fullMatches++;
                if (census.read(match::isVisibleToUser)) visible++;
            }
        }
        return new JSONObject().put("results", matches.size()).put("fullMatches", fullMatches).put("visibleFullMatches", visible);
    }

    private void observeFailureWindows(WindowCensus census, JSONObject metadata) throws Exception {
        UiAutomation automation = census.read(instrumentation::getUiAutomation);
        AccessibilityServiceInfo service = census.read(automation::getServiceInfo);
        if (service == null) { census.capabilityMissing = true; return; }
        int flags = service.flags;
        int capabilities = census.read(service::getCapabilities);
        if (census.serviceObserved && (flags != census.expectedFlags || capabilities != census.originalCapabilities)) {
            census.serviceDrift = true;
            throw new IllegalStateException("UiAutomation service changed during owned-bit observation");
        }
        boolean interactive = (flags & AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS) != 0;
        boolean content = (capabilities & AccessibilityServiceInfo.CAPABILITY_CAN_RETRIEVE_WINDOW_CONTENT) != 0;
        metadata.put("flags", flags).put("capabilities", capabilities).put("retrieveWindowContent", content)
            .put("reportViewIds", (flags & AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS) != 0)
            .put("includeNotImportantViews", (flags & AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS) != 0)
            .put("retrieveInteractiveWindows", interactive);
        if (!content) { census.capabilityMissing = true; return; }
        String ownPackage = census.read(() -> instrumentation.getTargetContext().getPackageName());
        AccessibilityNodeInfo active = census.root(automation::getRootInActiveWindow);
        int activeId = active == null ? -1 : census.read(active::getWindowId);
        if (active != null) {
            String kind = censusPackage(active, census, ownPackage);
            metadata.put("activeRoot", censusRootMetadata(active, census, kind));
            if ("SystemUI".equals(kind)) metadata.put("activeLiteralTitle", censusExactQuery(active, census, "Pairing request", true));
        }
        // The original census never enables capabilities; only the separately
        // opted-in wrapper may temporarily own the interactive-window flag.
        if (!interactive) { census.capabilityMissing = true; return; }
        census.check();
        census.windows = automation.getWindows(); // Register the entire list, including any late/over-cap entries.
        census.check();
        if (census.windows == null) { census.scopeUnknown = true; return; }
        if (census.windows.size() > 8) census.windowCapped = true;
        metadata.put("returnedWindows", census.windows.size());
        JSONArray windows = new JSONArray();
        metadata.put("windows", windows);
        int otherSystemUiRoots = 0;
        for (int index = 0; index < Math.min(8, census.windows.size()); index++) {
            census.check();
            AccessibilityWindowInfo window = census.windows.get(index);
            if (window == null) { census.scopeUnknown = true; continue; }
            JSONObject item = new JSONObject();
            windows.put(item);
            int id = census.read(window::getId);
            item.put("id", id).put("type", census.read(window::getType)).put("layer", census.read(window::getLayer))
                .put("displayId", census.read(window::getDisplayId)).put("activeRootWindow", id == activeId)
                .put("active", census.read(window::isActive)).put("focused", census.read(window::isFocused))
                .put("accessibilityFocused", census.read(window::isAccessibilityFocused));
            Rect bounds = new Rect();
            census.read(() -> { window.getBoundsInScreen(bounds); return true; });
            item.put("bounds", new JSONArray().put(bounds.left).put(bounds.top).put(bounds.right).put(bounds.bottom));
            if (id == activeId) continue;
            AccessibilityNodeInfo root = census.root(window::getRoot);
            if (root == null) continue;
            String kind = censusPackage(root, census, ownPackage);
            item.put("root", censusRootMetadata(root, census, kind));
            if (!"SystemUI".equals(kind)) continue;
            if (++otherSystemUiRoots > 2) { census.rootCapped = true; continue; }
            item.put("peerName", censusExactQuery(root, census, peerName, false));
            item.put("fullPeerId", censusExactQuery(root, census, peerId, false));
            item.put("literalTitle", censusExactQuery(root, census, "Pairing request", true));
        }
        if (census.windows.isEmpty()) census.scopeUnknown = true;
    }

    private boolean knownLiteral(CharSequence actual, String expected, boolean title) {
        return actual != null && (title ? expected.contentEquals(actual) : actual.toString().contains(expected));
    }

    private JSONObject localKnownFields(AccessibilityNodeInfo node, WindowCensus census) throws Exception {
        CharSequence text = census.read(node::getText);
        CharSequence description = census.read(node::getContentDescription);
        // Only these known-literal booleans escape; unmatched values are discarded.
        return new JSONObject().put("titleText", knownLiteral(text, "Pairing request", true))
            .put("nameText", knownLiteral(text, peerName, false)).put("peerIdText", knownLiteral(text, peerId, false))
            .put("titleDescription", knownLiteral(description, "Pairing request", true))
            .put("nameDescription", knownLiteral(description, peerName, false)).put("peerIdDescription", knownLiteral(description, peerId, false));
    }

    private JSONObject localRemoteQuery(AccessibilityNodeInfo root, WindowCensus census, String expected) throws Exception {
        List<AccessibilityNodeInfo> matches = census.query(root, expected);
        int text = 0, description = 0, visibleText = 0, visibleDescription = 0;
        boolean title = expected.equals("Pairing request");
        for (AccessibilityNodeInfo node : matches) {
            if (node == null) { census.scopeUnknown = true; continue; }
            boolean t = knownLiteral(census.read(node::getText), expected, title);
            boolean d = knownLiteral(census.read(node::getContentDescription), expected, title);
            boolean visible = census.read(node::isVisibleToUser);
            if (t) { text++; if (visible) visibleText++; }
            if (d) { description++; if (visible) visibleDescription++; }
        }
        return new JSONObject().put("results", matches.size()).put("knownTextMatches", text).put("knownDescriptionMatches", description)
            .put("visibleKnownTextMatches", visibleText).put("visibleKnownDescriptionMatches", visibleDescription);
    }

    private JSONObject localRootOwner(AccessibilityNodeInfo root, WindowCensus census) throws Exception {
        String ownPackage = instrumentation.getTargetContext().getPackageName();
        String kind = censusPackage(root, census, ownPackage);
        if (!"SystemUI".equals(kind)) { census.scopeUnknown = true; throw new ProbeLimit(); }
        JSONObject result = censusRootMetadata(root, census, kind);
        result.remove("childCount"); // Content metadata may change; it is not owner identity.
        Rect bounds = new Rect();
        census.read(() -> { root.getBoundsInScreen(bounds); return true; });
        return result.put("bounds", new JSONArray().put(bounds.left).put(bounds.top).put(bounds.right).put(bounds.bottom));
    }

    private void walkLocalNotificationNodes(AccessibilityNodeInfo node, int depth, WindowCensus census,
            List<AccessibilityNodeInfo> seen, int[] counts, JSONObject totals, JSONArray matches) throws Exception {
        for (AccessibilityNodeInfo prior : seen) if (census.read(() -> prior.equals(node))) {
            census.scopeUnknown = true; return;
        }
        seen.add(node);
        String id = census.read(node::getViewIdResourceName);
        if (TEMPLATE_ID.equals(id) && ++counts[1] > 4) { census.rootCapped = true; throw new ProbeLimit(); }
        JSONObject fields = localKnownFields(node, census);
        boolean matched = false;
        for (String key : new String[]{"titleText", "nameText", "peerIdText", "titleDescription", "nameDescription", "peerIdDescription"}) {
            if (fields.getBoolean(key)) { totals.put(key, totals.optInt(key) + 1); matched = true; }
        }
        if (matched) {
            boolean visible = census.read(node::isVisibleToUser);
            if (visible) for (String key : new String[]{"titleText", "nameText", "peerIdText", "titleDescription", "nameDescription", "peerIdDescription"})
                if (fields.getBoolean(key)) totals.put(key + "Visible", totals.optInt(key + "Visible") + 1);
            if (matches.length() >= 4) { census.resultCapped = true; throw new ProbeLimit(); }
            JSONObject item = censusRootMetadata(node, census, censusPackage(node, census, instrumentation.getTargetContext().getPackageName()));
            matches.put(item.put("depth", depth).put("knownMatches", fields));
        }
        int children = census.read(node::getChildCount);
        if (children > 8 || (depth >= 6 && children > 0)) census.rootCapped = true;
        if (depth >= 6) return;
        for (int index = 0; index < Math.min(8, children); index++) {
            if (counts[0] >= 24) { census.rootCapped = true; return; }
            final int childIndex = index;
            counts[0]++; // Count even null/late/cyclic acquisitions before the call.
            AccessibilityNodeInfo child = census.root(() -> node.getChild(childIndex));
            if (child != null) walkLocalNotificationNodes(child, depth + 1, census, seen, counts, totals, matches);
        }
    }

    private void observeLocalNodeComparison(WindowCensus census, JSONObject metadata) throws Exception {
        UiAutomation automation = census.read(instrumentation::getUiAutomation);
        AccessibilityServiceInfo service = census.read(automation::getServiceInfo);
        if (service == null || !census.serviceObserved || service.flags != census.expectedFlags
                || service.getCapabilities() != census.originalCapabilities) {
            census.serviceDrift = true; throw new ProbeLimit();
        }
        int required = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS | AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
            | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        if ((service.flags & required) != required
                || (service.getCapabilities() & AccessibilityServiceInfo.CAPABILITY_CAN_RETRIEVE_WINDOW_CONTENT) == 0) {
            census.capabilityMissing = true; return;
        }
        AccessibilityNodeInfo root = census.root(automation::getRootInActiveWindow);
        if (root == null) return;
        JSONObject before = localRootOwner(root, census);
        metadata.put("mode", "local-node-search-differential").put("ownerBefore", before);
        metadata.put("remoteTitle", localRemoteQuery(root, census, "Pairing request"));
        metadata.put("remoteName", localRemoteQuery(root, census, peerName));
        metadata.put("remotePeerId", localRemoteQuery(root, census, peerId));
        String containerId = "com.android.systemui:id/notification_stack_scroller";
        List<AccessibilityNodeInfo> containers = census.queryId(root, containerId);
        metadata.put("containerResults", containers.size());
        if (containers.size() != 1 || containers.get(0) == null) { census.scopeUnknown = true; return; }
        AccessibilityNodeInfo container = containers.get(0);
        int containerWindow = census.read(container::getWindowId), activeWindow = census.read(root::getWindowId);
        if (!"SystemUI".equals(censusPackage(container, census, instrumentation.getTargetContext().getPackageName()))
                || containerWindow != activeWindow
                || !containerId.equals(census.read(container::getViewIdResourceName)) || !census.read(container::isVisibleToUser)) {
            census.scopeUnknown = true; return;
        }
        JSONObject totals = new JSONObject(); JSONArray matches = new JSONArray(); int[] counts = {1, 0};
        metadata.put("localKnownMatchCounts", totals).put("localKnownMatches", matches);
        try { walkLocalNotificationNodes(container, 0, census, new ArrayList<>(), counts, totals, matches); }
        finally { metadata.put("localNodeAcquisitionAttempts", counts[0]).put("templateCandidates", counts[1]); }
        AccessibilityNodeInfo afterRoot = census.root(automation::getRootInActiveWindow);
        if (afterRoot == null) return;
        JSONObject after = localRootOwner(afterRoot, census);
        metadata.put("ownerAfter", after).put("ownerUnchanged", before.toString().equals(after.toString()));
        if (!before.toString().equals(after.toString())) census.scopeUnknown = true;
        census.check();
    }

    /** Fixed field retrieval only; the original capped walk remains unchanged. */
    private void observeFixedResourceFields(WindowCensus census, JSONObject metadata) throws Exception {
        UiAutomation automation = census.read(instrumentation::getUiAutomation);
        AccessibilityServiceInfo service = census.read(automation::getServiceInfo);
        if (service == null || !census.serviceObserved || service.flags != census.expectedFlags
                || service.getCapabilities() != census.originalCapabilities) {
            census.serviceDrift = true; throw new ProbeLimit();
        }
        int required = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS | AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
            | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        if ((service.flags & required) != required
                || (service.getCapabilities() & AccessibilityServiceInfo.CAPABILITY_CAN_RETRIEVE_WINDOW_CONTENT) == 0) {
            census.capabilityMissing = true; return;
        }
        AccessibilityNodeInfo root = census.root(automation::getRootInActiveWindow);
        if (root == null) return;
        JSONObject before = localRootOwner(root, census);
        metadata.put("mode", "fixed-resource-field-differential").put("ownerBefore", before);
        metadata.put("remoteTitle", localRemoteQuery(root, census, "Pairing request"));
        metadata.put("remoteName", localRemoteQuery(root, census, peerName));
        metadata.put("remotePeerId", localRemoteQuery(root, census, peerId));
        String containerId = "com.android.systemui:id/notification_stack_scroller";
        List<AccessibilityNodeInfo> containers = census.queryId(root, containerId);
        metadata.put("containerResults", containers.size());
        if (containers.size() != 1 || containers.get(0) == null) { census.scopeUnknown = true; return; }
        AccessibilityNodeInfo container = containers.get(0);
        int window = census.read(root::getWindowId);
        String ownPackage = instrumentation.getTargetContext().getPackageName();
        if (!"SystemUI".equals(censusPackage(container, census, ownPackage)) || census.read(container::getWindowId) != window
                || !containerId.equals(census.read(container::getViewIdResourceName)) || !census.read(container::isVisibleToUser)) {
            census.scopeUnknown = true; return;
        }
        JSONObject totals = new JSONObject(), queries = new JSONObject(); JSONArray matches = new JSONArray();
        List<AccessibilityNodeInfo> seen = new ArrayList<>();
        metadata.put("fixedKnownMatchCounts", totals).put("fixedKnownMatches", matches).put("fixedQueryResults", queries);
        for (String id : new String[]{"android:id/title", "android:id/text", "android:id/big_text"}) {
            List<AccessibilityNodeInfo> fields = census.queryId(container, id);
            queries.put(id, fields.size());
            for (AccessibilityNodeInfo field : fields) {
                if (field == null) { census.scopeUnknown = true; throw new ProbeLimit(); }
                for (AccessibilityNodeInfo prior : seen) if (census.read(() -> prior.equals(field))) {
                    census.scopeUnknown = true; throw new ProbeLimit();
                }
                seen.add(field);
                String kind = censusPackage(field, census, ownPackage);
                if (!(kind.equals("SystemUI") || kind.equals("android") || kind.equals("own"))
                        || census.read(field::getWindowId) != window || !id.equals(census.read(field::getViewIdResourceName))) {
                    census.scopeUnknown = true; throw new ProbeLimit();
                }
                JSONObject known = localKnownFields(field, census);
                boolean visible = census.read(field::isVisibleToUser), matched = false;
                for (String key : new String[]{"titleText", "nameText", "peerIdText", "titleDescription", "nameDescription", "peerIdDescription"}) {
                    if (known.getBoolean(key)) {
                        totals.put(key, totals.optInt(key) + 1); matched = true;
                        if (visible) totals.put(key + "Visible", totals.optInt(key + "Visible") + 1);
                    }
                }
                if (!matched) continue; // Never emit unmatched text/description or its derived metadata.
                if (matches.length() >= 4) { census.resultCapped = true; throw new ProbeLimit(); }
                String className = String.valueOf(census.read(field::getClassName));
                JSONObject item = new JSONObject().put("windowId", window).put("package", kind).put("resourceId", id)
                    .put("class", className.startsWith("android.") || className.startsWith("com.android.systemui.")
                        || className.startsWith("com.android.internal.") ? safeMetadata(className) : "<other>")
                    .put("visible", visible).put("enabled", census.read(field::isEnabled)).put("knownMatches", known);
                matches.put(item);
            }
        }
        AccessibilityNodeInfo afterRoot = census.root(automation::getRootInActiveWindow);
        if (afterRoot == null) return;
        JSONObject after = localRootOwner(afterRoot, census);
        metadata.put("ownerAfter", after).put("ownerUnchanged", before.toString().equals(after.toString()))
            .put("zeroMeaning", "only-these-fixed-fields-no-global-absence-claim");
        if (!before.toString().equals(after.toString())) census.scopeUnknown = true;
        census.check();
    }

    private void logFailureWindowCensus(Throwable original, long holdEnd) throws Exception {
        WindowCensus census = new WindowCensus(holdEnd);
        JSONObject metadata = new JSONObject();
        Throwable error = null;
        try {
            beginInteractiveWindowObservation(census);
            if ("true".equals(InstrumentationRegistry.getArguments().getString("notificationFixedResourceFields")))
                observeFixedResourceFields(census, metadata);
            else if ("true".equals(InstrumentationRegistry.getArguments().getString("notificationLocalNodeComparison")))
                observeLocalNodeComparison(census, metadata);
            else observeFailureWindows(census, metadata);
        } catch (ProbeLimit limit) {
            census.scopeUnknown = true;
        } catch (Throwable failure) {
            error = failure;
            retainRowFailureDiagnostic(original, failure, "window-census-read");
        } finally {
            try { restoreInteractiveWindowObservation(census); }
            finally { census.recycleAll(); }
        }
        if (census.serviceFailure != null) retainRowFailureDiagnostic(original, census.serviceFailure, "window-census-service-restore");
        if (census.cleanupFailure != null) retainRowFailureDiagnostic(original, census.cleanupFailure, "window-census-recycle");
        long ended = SystemClock.uptimeMillis();
        String prefix = "window-census nonce=" + nonce + " selectionAuthority=false startedUptimeMs=" + census.start
            + " deadlineUptimeMs=" + census.end + " endedUptimeMs=" + ended;
        String line = prefix + " observation=" + (census.incomplete() || error != null ? "UNKNOWN" : "complete")
            + " queries=" + census.queries + " timeCapped=" + census.timeCapped + " windowCapped=" + census.windowCapped
            + " rootCapped=" + census.rootCapped + " resultCapped=" + census.resultCapped
            + " capabilityMissing=" + census.capabilityMissing + " scopeUnknown=" + census.scopeUnknown
            + " cleanupError=" + (census.cleanupFailure != null) + " service=" + census.serviceMetadata + " metadata=" + metadata;
        // One compact entry avoids platform log truncation; total diagnostic output stays below8KiB.
        if (line.getBytes(StandardCharsets.UTF_8).length > 3900) line = prefix + " observation=UNKNOWN outputCapped=true service=" + census.serviceMetadata;
        Log.i(TAG, line);
    }

    private void publishFailureScreenPhase(File phase, String value, boolean fresh) throws Exception {
        byte[] bytes = ("N16_SCREEN_V1\n" + nonce + "\n" + value + "\n").getBytes(StandardCharsets.US_ASCII);
        if (bytes.length > 256) throw new java.io.IOException("Failure phase exceeds byte cap");
        if (fresh && phase.exists()) throw new java.io.IOException("Failure phase already exists");
        if (!fresh) {
            byte[] expected = ("N16_SCREEN_V1\n" + nonce + "\nREADY\n").getBytes(StandardCharsets.US_ASCII);
            byte[] observed = new byte[257];
            int used = 0;
            try (InputStream input = Files.newInputStream(phase.toPath())) {
                int count;
                while (used < observed.length && (count = input.read(observed, used, observed.length - used)) != -1) used += count;
            }
            if (used != expected.length || !java.util.Arrays.equals(java.util.Arrays.copyOf(observed, used), expected)) {
                throw new java.io.IOException("Failure phase changed before END");
            }
        }
        File pending = new File(phase.getPath() + ".tmp");
        boolean created = false;
        try {
            Files.createFile(pending.toPath());
            created = true;
            Files.write(pending.toPath(), bytes, StandardOpenOption.WRITE);
            if (fresh) Files.move(pending.toPath(), phase.toPath(), StandardCopyOption.ATOMIC_MOVE);
            else Files.move(pending.toPath(), phase.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            if (created) Files.deleteIfExists(pending.toPath());
        }
    }

    private void retainRowFailureDiagnostic(Throwable original, Throwable diagnostic, String stage) {
        try { original.addSuppressed(diagnostic); } catch (Throwable ignored) { /* Original failure wins. */ }
        try {
            Log.i(TAG, "row-failure-screen-secondary nonce=" + nonce + " stage=" + stage
                + " errorClass=" + safeMetadata(diagnostic.getClass().getSimpleName()) + " timingAuthority=false");
        } catch (Throwable ignored) { /* Logging cannot replace the original assertion/runtime failure. */ }
    }

    private StatusBarNotification awaitOwnPeerNotification() throws Exception {
        NotificationManager manager = instrumentation.getTargetContext().getSystemService(NotificationManager.class);
        long end = SystemClock.uptimeMillis() + 20000;
        do {
            for (StatusBarNotification posted : manager.getActiveNotifications()) {
                String body = posted.getNotification().extras.getString(Notification.EXTRA_TEXT, "");
                if (body.contains(peerName)) return posted;
            }
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        throw new AssertionError("No actual OS notification for the genuine peer request");
    }

    // Observe only this existing shell action's completion. No output body is logged,
    // and completion does not establish that SystemUI exposed or selected a row.
    private void expandNotificationsWithCompletionWitness() {
        final int cap = 4096;
        long start = SystemClock.uptimeMillis();
        boolean eof = false;
        String errorClass = "none";
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try {
            // UiAutomation executes a command via Runtime.exec(String), which does not
            // interpret shell quoting. API31's public stdin pipe carries this fixed script.
            ParcelFileDescriptor[] pipes = instrumentation.getUiAutomation().executeShellCommandRw("sh");
            try (ParcelFileDescriptor descriptor = pipes[0]; ParcelFileDescriptor input = pipes[1]) {
                byte[] script = ("cmd statusbar expand-notifications 2>&1\nresult=$?\n"
                    + "printf '\\nCLIPP_NOTIFICATION16_EXPAND_EXIT=%s\\n' \"$result\"\nexit\n")
                    .getBytes(StandardCharsets.UTF_8);
                if (Os.write(input.getFileDescriptor(), script, 0, script.length) != script.length) {
                    throw new java.io.IOException("Incomplete fixed diagnostic script write");
                }
                input.close();
                StructPollfd poll = new StructPollfd();
                poll.fd = descriptor.getFileDescriptor();
                poll.events = (short) (OsConstants.POLLIN | OsConstants.POLLHUP | OsConstants.POLLERR);
                byte[] buffer = new byte[512];
                while (SystemClock.uptimeMillis() - start < 2000 && bytes.size() < cap) {
                    try {
                        int remaining = (int) Math.max(1, 2000 - (SystemClock.uptimeMillis() - start));
                        if (Os.poll(new StructPollfd[] { poll }, Math.min(100, remaining)) == 0) continue;
                        int count = Os.read(poll.fd, buffer, 0, Math.min(buffer.length, cap - bytes.size()));
                        if (count == 0) { eof = true; break; }
                        bytes.write(buffer, 0, count);
                    } catch (ErrnoException error) {
                        if (error.errno != OsConstants.EINTR && error.errno != OsConstants.EAGAIN) throw error;
                    }
                }
            }
        } catch (Exception error) {
            errorClass = safeMetadata(error.getClass().getSimpleName());
        }
        String status = "unobserved";
        Matcher marker = Pattern.compile("(?:^|\\n)CLIPP_NOTIFICATION16_EXPAND_EXIT=([0-9]{1,3})(?:\\n|$)")
            .matcher(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        if (marker.find()) status = marker.group(1);
        String digest = "unavailable";
        try {
            StringBuilder hex = new StringBuilder();
            for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray())) {
                hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
            }
            digest = hex.toString();
        } catch (Exception error) {
            errorClass = safeMetadata(error.getClass().getSimpleName());
        }
        Log.i(TAG, "expand-completion nonce=" + nonce + " eof=" + eof + " status=" + status
            + " bytes=" + bytes.size() + " capped=" + (bytes.size() == cap)
            + " elapsedMs=" + (SystemClock.uptimeMillis() - start) + " sha256=" + digest
            + " errorClass=" + errorClass);
    }

    private static String safeMetadata(CharSequence value) {
        if (value == null) return "<null>";
        String text = value.toString();
        return text.length() <= 160 && text.matches("[A-Za-z0-9_.$:/-]*") ? text : "<redacted>";
    }

    private JSONObject nodeMetadata(AccessibilityNodeInfo node) throws Exception {
        JSONObject result = new JSONObject();
        result.put("package", safeMetadata(node.getPackageName()));
        result.put("class", safeMetadata(node.getClassName()));
        result.put("resourceId", safeMetadata(node.getViewIdResourceName()));
        result.put("visible", node.isVisibleToUser());
        result.put("clickable", node.isClickable());
        result.put("enabled", node.isEnabled());
        return result;
    }

    private String peerRowMetadata(AccessibilityNodeInfo root, List<AccessibilityNodeInfo> matches) {
        try {
            JSONObject snapshot = new JSONObject();
            snapshot.put("root", root == null ? JSONObject.NULL : nodeMetadata(root));
            boolean queried = root != null && "com.android.systemui".equals(String.valueOf(root.getPackageName()));
            snapshot.put("peerNameQueryPerformed", queried);
            snapshot.put("peerNameMatchCount", queried ? matches.size() : JSONObject.NULL);
            JSONArray nodes = new JSONArray();
            for (int index = 0; index < Math.min(4, matches.size()); index++) {
                JSONArray chain = new JSONArray();
                // Copy so diagnostics own every traversed node independently of click selection.
                AccessibilityNodeInfo node = AccessibilityNodeInfo.obtain(matches.get(index));
                try {
                    for (int depth = 0; node != null && depth < 6; depth++) {
                        chain.put(nodeMetadata(node));
                        AccessibilityNodeInfo parent = depth < 5 ? node.getParent() : null;
                        node.recycle();
                        node = parent;
                    }
                } finally {
                    if (node != null) node.recycle();
                }
                nodes.put(chain);
            }
            snapshot.put("matchingNodeParentChains", nodes);
            return snapshot.toString();
        } catch (Exception error) {
            return "{\"diagnosticErrorClass\":\"" + safeMetadata(error.getClass().getSimpleName()) + "\"}";
        }
    }

    private void logPeerRowSnapshot(String stage, String metadata) {
        try {
            JSONObject snapshot = new JSONObject(metadata);
            JSONArray chains = snapshot.optJSONArray("matchingNodeParentChains");
            snapshot.remove("matchingNodeParentChains");
            Log.i(TAG, "peer-row-snapshot nonce=" + nonce + " stage=" + stage + " metadata=" + snapshot);
            // Separate bounded lines avoid Android log-entry truncation. At most four
            // match chains, each at most six metadata-only ancestors, per snapshot.
            if (chains != null) for (int index = 0; index < chains.length(); index++) {
                Log.i(TAG, "peer-row-chain nonce=" + nonce + " stage=" + stage
                    + " matchIndex=" + index + " metadata=" + chains.getJSONArray(index));
            }
        } catch (Exception error) {
            Log.i(TAG, "peer-row-snapshot nonce=" + nonce + " stage=" + stage
                + " diagnosticErrorClass=" + safeMetadata(error.getClass().getSimpleName()));
        }
    }

    private void logOwnNotificationEligibility(String stage, StatusBarNotification expected) {
        JSONObject metadata = new JSONObject();
        try {
            Context context = instrumentation.getTargetContext();
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            StatusBarNotification[] active = manager.getActiveNotifications();
            StatusBarNotification current = null;
            for (StatusBarNotification item : active) {
                if (item.getId() == expected.getId()
                        && item.getPackageName().equals(expected.getPackageName())
                        && java.util.Objects.equals(item.getTag(), expected.getTag())) current = item;
            }
            metadata.put("package", safeMetadata(expected.getPackageName()));
            metadata.put("id", expected.getId());
            metadata.put("channel", safeMetadata(expected.getNotification().getChannelId()));
            metadata.put("sameOwnNotificationActive", current != null);
            metadata.put("ownActiveCount", active.length);
            metadata.put("appEnabled", manager.areNotificationsEnabled());
            metadata.put("appImportance", manager.getImportance());
            metadata.put("interruptionFilter", manager.getCurrentInterruptionFilter());
            NotificationChannel channel = manager.getNotificationChannel(expected.getNotification().getChannelId());
            metadata.put("channelExists", channel != null);
            if (channel != null) {
                metadata.put("channelImportance", channel.getImportance());
                metadata.put("channelLockscreenVisibility", channel.getLockscreenVisibility());
                String groupId = channel.getGroup();
                metadata.put("channelGroupPresent", groupId != null);
                if (groupId != null) {
                    NotificationChannelGroup group = manager.getNotificationChannelGroup(groupId);
                    metadata.put("channelGroupFound", group != null);
                    metadata.put("channelGroupBlocked", group == null ? JSONObject.NULL : group.isBlocked());
                }
            }
            KeyguardManager keyguard = context.getSystemService(KeyguardManager.class);
            metadata.put("keyguardLocked", keyguard.isKeyguardLocked());
            metadata.put("deviceLocked", keyguard.isDeviceLocked());
            if (current != null) {
                Notification notification = current.getNotification();
                metadata.put("flags", notification.flags);
                metadata.put("groupSummary", (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0);
                metadata.put("ongoing", current.isOngoing());
                metadata.put("clearable", current.isClearable());
                metadata.put("visibility", notification.visibility);
                metadata.put("priority", notification.priority);
                metadata.put("isGroup", current.isGroup());
                metadata.put("groupPresent", notification.getGroup() != null);
                metadata.put("publicVersionPresent", notification.publicVersion != null);
                metadata.put("contentIntentPresent", notification.contentIntent != null);
                CharSequence title = notification.extras.getCharSequence(Notification.EXTRA_TITLE, "");
                metadata.put("ownTitleMatches", "Pairing request".contentEquals(title == null ? "" : title));
                String body = notification.extras.getString(Notification.EXTRA_TEXT, "");
                metadata.put("ownBodyContainsSyntheticPeerName", body.contains(peerName));
                metadata.put("ownBodyContainsSyntheticPeerId", body.contains(peerId));
            }
            metadata.put("observation", "complete");
        } catch (Exception error) {
            try {
                metadata.put("observation", "UNKNOWN");
                metadata.put("errorClass", safeMetadata(error.getClass().getSimpleName()));
            } catch (Exception ignored) { /* JSONObject contains only safe primitive metadata. */ }
        }
        Log.i(TAG, "own-eligibility nonce=" + nonce + " stage=" + stage + " metadata=" + metadata);
    }

    // Fixed public-query identifiers only. They describe candidates, never a new
    // notification selector; the original exact-peer click path remains below.
    private static final String TEMPLATE_ID = "android:id/status_bar_latest_event_content";
    private static final String[] TARGET_IDS = {
        TEMPLATE_ID, "android:id/title", "android:id/text", "android:id/big_text",
        "android:id/app_name_text", "android:id/notification_header",
        "android:id/notification_top_line", "android:id/notification_main_column",
        "android:id/notification_headerless_view_row", "android:id/notification_headerless_view_column",
        "android:id/expand_button", "android:id/expand_button_touch_container",
        "com.android.systemui:id/legacy_window_root", "com.android.systemui:id/notification_stack_scroller",
        "com.android.systemui:id/notification_panel", "com.android.systemui:id/notification_container_parent"
    };

    private interface ProbeRead<T> { T read(); }
    private static final class ProbeLimit extends RuntimeException {}

    private static final class TargetProbe {
        final long start, end;
        final List<List<AccessibilityNodeInfo>> queryResults = new ArrayList<>();
        final List<AccessibilityNodeInfo> parents = new ArrayList<>();
        int queries;
        boolean timeCapped, queryCapped, resultCapped, ancestryCapped, bodyCapped, capabilityMissing, scopeUnknown;
        String cleanupErrorClass = "none";
        TargetProbe(long rowEnd) {
            start = SystemClock.uptimeMillis();
            end = Math.min(rowEnd, start + 100);
        }
        void check() {
            if (SystemClock.uptimeMillis() >= end) { timeCapped = true; throw new ProbeLimit(); }
        }
        <T> T read(ProbeRead<T> operation) {
            check();
            T value = operation.read();
            // A framework call is not interruptible. A late result is UNKNOWN,
            // and all acquired nodes remain owned until the unconditional cleanup.
            check();
            return value;
        }
        List<AccessibilityNodeInfo> query(ProbeRead<List<AccessibilityNodeInfo>> operation) {
            check();
            if (queries == 8) { queryCapped = true; throw new ProbeLimit(); }
            queries++;
            List<AccessibilityNodeInfo> result = operation.read();
            queryResults.add(result); // Register every returned node BEFORE checking a late return.
            check();
            if (result.size() > 4) { resultCapped = true; throw new ProbeLimit(); }
            return result;
        }
        AccessibilityNodeInfo parent(AccessibilityNodeInfo node) {
            check();
            AccessibilityNodeInfo result = node.getParent();
            if (result != null) parents.add(result);
            check();
            return result;
        }
        void recycleAll() {
            // Cleanup is mandatory even after the observation deadline. Identity
            // dedup avoids recycling the same returned object twice across lists.
            IdentityHashMap<AccessibilityNodeInfo, Boolean> seen = new IdentityHashMap<>();
            for (List<AccessibilityNodeInfo> result : queryResults) if (result != null) {
                for (AccessibilityNodeInfo node : result) if (node != null && seen.put(node, true) == null) recycle(node);
            }
            for (AccessibilityNodeInfo node : parents) if (seen.put(node, true) == null) recycle(node);
            if (SystemClock.uptimeMillis() >= end) timeCapped = true;
        }
        void recycle(AccessibilityNodeInfo node) {
            try { node.recycle(); }
            catch (RuntimeException error) { cleanupErrorClass = safeMetadata(error.getClass().getSimpleName()); }
        }
        boolean incomplete() {
            return timeCapped || queryCapped || resultCapped || ancestryCapped || bodyCapped || capabilityMissing
                || scopeUnknown || !"none".equals(cleanupErrorClass);
        }
    }

    private static boolean knownTargetId(String id) {
        for (String known : TARGET_IDS) if (known.equals(id)) return true;
        return false;
    }

    private static final class CandidateTrace {
        final String kind;
        final JSONArray metadata = new JSONArray();
        CandidateTrace(String kind) { this.kind = kind; }
        AccessibilityNodeInfo template;
        boolean targetPackageObserved;
    }

    private CandidateTrace traceCandidate(AccessibilityNodeInfo anchor, TargetProbe probe, String ownPackage,
            String kind, List<CandidateTrace> traces) throws Exception {
        CandidateTrace trace = new CandidateTrace(kind);
        traces.add(trace); // Preserve completed safe metadata even if a later ancestor call is late.
        AccessibilityNodeInfo node = anchor;
        for (int index = 0; node != null && index < 6; index++) {
            String id = probe.read(node::getViewIdResourceName);
            String packageName = String.valueOf(probe.read(node::getPackageName));
            trace.targetPackageObserved |= ownPackage.equals(packageName);
            String className = String.valueOf(probe.read(node::getClassName));
            JSONObject metadata = new JSONObject();
            metadata.put("resourceId", knownTargetId(id) ? id : "<other>");
            metadata.put("package", packageName.equals(ownPackage) || packageName.equals("com.android.systemui")
                || packageName.equals("android") ? safeMetadata(packageName) : "<other>");
            metadata.put("class", className.startsWith("android.") || className.startsWith("com.android.systemui.")
                || className.startsWith("com.android.internal.") ? safeMetadata(className) : "<other>");
            metadata.put("visible", probe.read(node::isVisibleToUser));
            metadata.put("enabled", probe.read(node::isEnabled));
            metadata.put("clickable", probe.read(node::isClickable));
            metadata.put("actionMask", probe.read(node::getActions));
            trace.metadata.put(metadata);
            if (TEMPLATE_ID.equals(id)) { trace.template = node; return trace; }
            if (index == 5) { probe.ancestryCapped = true; break; }
            node = probe.parent(node);
        }
        return trace;
    }

    private void observeTargetedFields(AccessibilityNodeInfo root, TargetProbe probe,
            JSONObject metadata, List<CandidateTrace> traces) throws Exception {
        UiAutomation automation = probe.read(instrumentation::getUiAutomation);
        AccessibilityServiceInfo service = probe.read(automation::getServiceInfo);
        boolean reportIds = (service.flags & AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS) != 0;
        metadata.put("reportViewIds", reportIds);
        metadata.put("includeNotImportantViews", (service.flags & AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS) != 0);
        if (!reportIds) { probe.capabilityMissing = true; throw new ProbeLimit(); }
        Context context = probe.read(instrumentation::getTargetContext);
        String ownPackage = probe.read(context::getPackageName);

        List<AccessibilityNodeInfo> titles = probe.query(() -> root.findAccessibilityNodeInfosByViewId("android:id/title"));
        metadata.put("titleResults", titles.size());
        AccessibilityNodeInfo candidateTitle = null;
        int exactTitles = 0, visibleTitles = 0;
        for (AccessibilityNodeInfo title : titles) {
            CharSequence value = probe.read(title::getText);
            if ("Pairing request".contentEquals(value == null ? "" : value)) {
                exactTitles++;
                candidateTitle = title;
                if (probe.read(title::isVisibleToUser)) visibleTitles++;
            }
        }
        metadata.put("exactRequestTitles", exactTitles);
        metadata.put("visibleExactRequestTitles", visibleTitles);
        CandidateTrace titleTrace = null;
        if (exactTitles == 1) {
            titleTrace = traceCandidate(candidateTitle, probe, ownPackage, "known-title", traces);
        }

        // Full synthetic identity only, not a prefix/fuzzy lookup or fallback selector.
        List<AccessibilityNodeInfo> identities = probe.query(() -> root.findAccessibilityNodeInfosByText(peerId));
        metadata.put("fullPeerIdQueryResults", identities.size());
        AccessibilityNodeInfo candidateIdentity = null;
        int exactIdentities = 0;
        for (AccessibilityNodeInfo identity : identities) {
            CharSequence value = probe.read(identity::getText);
            if (value != null && value.toString().contains(peerId)) {
                exactIdentities++;
                candidateIdentity = identity;
            }
        }
        metadata.put("fullPeerIdTextMatches", exactIdentities);
        CandidateTrace identityTrace = null;
        if (exactIdentities == 1) {
            identityTrace = traceCandidate(candidateIdentity, probe, ownPackage, "full-synthetic-peer-id", traces);
        }
        metadata.put("titleTemplateFound", titleTrace != null && titleTrace.template != null);
        metadata.put("identityTemplateFound", identityTrace != null && identityTrace.template != null);
        if (titleTrace == null || titleTrace.template == null) {
            probe.scopeUnknown = true;
            metadata.put("scopeObservation", "UNKNOWN-no-single-title-template");
            return;
        }
        AccessibilityNodeInfo scope = titleTrace.template;
        AccessibilityNodeInfo identityTemplate = identityTrace == null ? null : identityTrace.template;
        boolean identitySameScope = identityTemplate != null && probe.read(() -> scope.equals(identityTemplate));
        metadata.put("syntheticIdentitySameTemplate", identitySameScope);

        List<AccessibilityNodeInfo> headers = probe.query(() -> scope.findAccessibilityNodeInfosByViewId("android:id/app_name_text"));
        metadata.put("scopedAppHeaderResults", headers.size());
        int ownHeaders = 0, visibleOwnHeaders = 0;
        for (AccessibilityNodeInfo header : headers) {
            CharSequence value = probe.read(header::getText);
            if ("Clipp".contentEquals(value == null ? "" : value)) {
                ownHeaders++;
                if (probe.read(header::isVisibleToUser)) visibleOwnHeaders++;
            }
        }
        metadata.put("scopedExactOwnHeaders", ownHeaders);
        metadata.put("scopedVisibleOwnHeaders", visibleOwnHeaders);
        metadata.put("titleChainTargetPackageObserved", titleTrace.targetPackageObserved);
        // Header/title alone allow this diagnostic comparison, NEVER selection.
        boolean compareBody = ownHeaders == 1 || identitySameScope || titleTrace.targetPackageObserved;
        if (!compareBody) probe.scopeUnknown = true;
        metadata.put("bodyComparisonGuard", compareBody);
        int bodyCompared = 0;
        boolean bodyPeerName = false, bodyPeerId = false;
        if (compareBody) for (String id : new String[] { "android:id/text", "android:id/big_text" }) {
            List<AccessibilityNodeInfo> bodies = probe.query(() -> scope.findAccessibilityNodeInfosByViewId(id));
            if (bodyCompared + bodies.size() > 2) { probe.bodyCapped = true; throw new ProbeLimit(); }
            for (AccessibilityNodeInfo body : bodies) {
                CharSequence value = probe.read(body::getText);
                bodyCompared++;
                String text = value == null ? "" : value.toString();
                bodyPeerName |= text.contains(peerName);
                bodyPeerId |= text.contains(peerId);
            }
        }
        metadata.put("bodyComparisonObservation", compareBody ? "queries-complete" : "skipped-no-guard");
        metadata.put("scopedBodyCompared", bodyCompared);
        metadata.put("scopedBodyContainsPeerName", bodyPeerName);
        metadata.put("scopedBodyContainsPeerId", bodyPeerId);
        boolean identityAndHeader = ownHeaders == 1 && (identitySameScope || (bodyPeerName && bodyPeerId));
        metadata.put("syntheticIdentityAndHeaderObserved", identityAndHeader);
        metadata.put("expandMetadataQueried", identityAndHeader);
        if (identityAndHeader) {
            List<AccessibilityNodeInfo> controls = probe.query(() -> scope.findAccessibilityNodeInfosByViewId("android:id/expand_button"));
            metadata.put("scopedExpandResults", controls.size());
            int visible = 0, enabled = 0, clickable = 0, actionMask = 0;
            for (AccessibilityNodeInfo control : controls) {
                if (probe.read(control::isVisibleToUser)) visible++;
                if (probe.read(control::isEnabled)) enabled++;
                if (probe.read(control::isClickable)) clickable++;
                actionMask |= probe.read(control::getActions);
            }
            metadata.put("scopedExpandVisible", visible);
            metadata.put("scopedExpandEnabled", enabled);
            metadata.put("scopedExpandClickable", clickable);
            metadata.put("scopedExpandActionMask", actionMask);
        }
    }

    private void logTargetedSystemUiProbe(AccessibilityNodeInfo root, long rowEnd, String stage) {
        TargetProbe probe = new TargetProbe(rowEnd);
        JSONObject metadata = new JSONObject();
        List<CandidateTrace> traces = new ArrayList<>();
        String errorClass = "none";
        try {
            observeTargetedFields(root, probe, metadata, traces);
        } catch (ProbeLimit limit) {
            // Missing capability or any partial/late result is diagnostic UNKNOWN.
        } catch (Exception error) {
            errorClass = safeMetadata(error.getClass().getSimpleName());
        } finally {
            probe.recycleAll();
        }
        Log.i(TAG, "systemui-targeted nonce=" + nonce + " stage=" + stage
            + " observation=" + (probe.incomplete() || !"none".equals(errorClass) ? "UNKNOWN" : "complete")
            + " queries=" + probe.queries + " elapsedMs=" + (SystemClock.uptimeMillis() - probe.start)
            + " timeCapped=" + probe.timeCapped
            + " queryCapped=" + probe.queryCapped + " resultCapped=" + probe.resultCapped
            + " ancestryCapped=" + probe.ancestryCapped + " bodyCapped=" + probe.bodyCapped
            + " capabilityMissing=" + probe.capabilityMissing + " scopeUnknown=" + probe.scopeUnknown
            + " cleanupErrorClass=" + probe.cleanupErrorClass + " errorClass=" + errorClass
            + " selectionAuthority=false metadata=" + metadata);
        for (int index = 0; index < traces.size(); index++) {
            Log.i(TAG, "systemui-targeted-chain nonce=" + nonce + " stage=" + stage
                + " candidateIndex=" + index + " kind=" + traces.get(index).kind
                + " metadata=" + traces.get(index).metadata);
        }
    }

    private void tapActualPeerNotification() {
        long end = SystemClock.uptimeMillis() + 5000;
        int emitted = 0;
        int probeCount = 0;
        String previous = null;
        String latest = "{\"unobserved\":true}";
        do {
            AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
            List<AccessibilityNodeInfo> matches = java.util.Collections.emptyList();
            try {
                boolean systemUi = root != null && "com.android.systemui".equals(String.valueOf(root.getPackageName()));
                if (systemUi) matches = root.findAccessibilityNodeInfosByText(peerName);
                latest = peerRowMetadata(root, matches);
                // Reserve the fourth snapshot for the actual click attempt or final failure.
                if (emitted < 3 && !latest.equals(previous)) {
                    logPeerRowSnapshot("observing", latest);
                    emitted++;
                    previous = latest;
                }
                if (systemUi) {
                    for (AccessibilityNodeInfo text : matches) {
                        AccessibilityNodeInfo row = AccessibilityNodeInfo.obtain(text);
                        try {
                            while (row != null && !row.isClickable()) {
                                AccessibilityNodeInfo parent = row.getParent();
                                row.recycle();
                                row = parent;
                            }
                            if (row != null && row.isVisibleToUser()) {
                                logPeerRowSnapshot("single-click-attempt", latest);
                                assertTrue("Actual SystemUI notification click must be accepted",
                                    row.performAction(AccessibilityNodeInfo.ACTION_CLICK));
                                return;
                            }
                        } finally {
                            if (row != null) row.recycle();
                        }
                    }
                }
                // Passive reads follow the original eligible-click path and share its
                // deadline; there is no expansion, alternative selector or extra wait.
                if (systemUi && (probeCount == 0 || (probeCount == 1 && end - SystemClock.uptimeMillis() <= 150))) {
                    logTargetedSystemUiProbe(root, end, probeCount == 0 ? "first-systemui" : "last-available");
                    probeCount++;
                }
            } finally {
                for (AccessibilityNodeInfo text : matches) text.recycle();
                if (root != null) root.recycle();
            }
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        if (probeCount < 2) Log.i(TAG, "systemui-targeted nonce=" + nonce
            + " stage=final-failure observation=UNKNOWN reason=no-remaining-row-budget snapshots=" + probeCount);
        logPeerRowSnapshot("final-failure", latest);
        throw new AssertionError("Actual visible SystemUI peer notification row required");
    }
}
