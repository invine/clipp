package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Instrumentation;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.graphics.Rect;
import android.os.Build;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import androidx.lifecycle.Lifecycle;
import android.content.Context;
import android.os.SystemClock;
import android.util.Log;
import android.view.KeyEvent;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TestName;
import org.junit.runner.RunWith;

/**
 * Opt-in instrumentation of the packaged production React/Capacitor app. DOM reads
 * locate/witness public controls; Android dispatches every tap, character and Back.
 * No fixture bridge, router, acknowledgment or private input handler is installed.
 * Root owns the authorized native/clipboard interval: launching this production app
 * starts its normal foreground runtime. Never run against an operator installation.
 */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class HostTaskInputTest {
    private static final long TIMEOUT_MS = 20_000;
    private static final long CAPTURE_QUIET_MS = 5_000;
    @Rule public final TestName testName = new TestName();
    private static final String DRAFT = "native back acceptance draft";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private ActivityScenario<MainActivity> scenario;
    private NativePublicWebView input;
    private String guestCaptureEvents = "";

    @Before
    public void requireIsolatedPackagedAppAndExplicitNativeInterval() throws Exception {
        Context target = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(target.getPackageName());
        Assume.assumeTrue("Root must opt in with -e hostTaskInputAcceptance true during its native interval",
            "true".equals(InstrumentationRegistry.getArguments().getString("hostTaskInputAcceptance")));
        if ("guestClipboardFocusLossAndNativeSettingsReturnEstablishBaselinesWithoutDuplicateClips".equals(testName.getMethodName()))
            requireGuestClipboardInterval();
        if ("realRejectedDeviceNameSaveRetainsNewerDraftAcrossNativeBackAndThenSaves".equals(testName.getMethodName()))
            Assume.assumeTrue("Root must separately authorize -e failedDeviceNameAcceptance true",
                "true".equals(InstrumentationRegistry.getArguments().getString("failedDeviceNameAcceptance")));
        AccessibilityServiceInfo accessibility = instrumentation.getUiAutomation().getServiceInfo();
        accessibility.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        instrumentation.getUiAutomation().setServiceInfo(accessibility);
        JSONObject config;
        try (InputStream stream = target.getAssets().open("capacitor.config.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
            config = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
        }
        JSONObject server = config.optJSONObject("server");
        assertTrue("Build/sync packaged production assets; a dev server is not native acceptance",
            server == null || !server.has("url"));
        try (InputStream stream = target.getAssets().open("public/index.html")) {
            assertTrue("Packaged web assets are required", stream.read() != -1);
        }
        scenario = ActivityScenario.launch(MainActivity.class);
        input = new NativePublicWebView(instrumentation, scenario);
        await("production workspace ready", "document.querySelector('nav[aria-label=\"Clipp destinations\"]') !== null");
        assertEquals("https://localhost/", evaluate("location.origin + '/'"));
        logGeometry("launch");
    }

    @After
    public void closeOnlyTheIsolatedActivity() {
        if (scenario != null) scenario.close();
    }

    @Test
    public void imeBackPrecedesNestedTaskBackAndTwoTaskPressesRetainDraftAndFocus() throws Exception {
        openPairing();
        awaitIme(false);
        assertFocusedButton("Close Pairing");
        tapButton("Paste pairing text");
        awaitDialog("Paste pairing text");
        await("Paste owns focus", "document.activeElement?.getAttribute('aria-label') === 'Pairing text'");
        tap("document.querySelector('textarea[aria-label=\"Pairing text\"]')");
        // A real software keyboard is a prerequisite, not an inferred CSS viewport change.
        awaitIme(true);
        instrumentation.sendStringSync(DRAFT);
        awaitDraft();

        nativeBack();
        awaitIme(false);
        assertStableDialog("Paste pairing text");
        awaitDraft();
        // The real client rejects this synthetic invalid payload without a remote peer.
        tapButton("Submit pairing text");
        await("real rejected submission shown", "[...document.querySelectorAll('[role=\"status\"]')].some(e => e.textContent.trim() === 'Invalid pairing payload. Edit the text and try again.')");
        awaitDraft();
        // Pending Submit loses focus when disabled; task recovery returns to the
        // editable field. Its real IME must be dismissed before another task Back.
        await("failed submission returns editor focus", "document.activeElement?.getAttribute('aria-label') === 'Pairing text'");
        awaitIme(true);
        nativeBack();
        awaitIme(false);
        assertStableDialog("Paste pairing text");
        awaitDraft();

        nativeBack();
        awaitDialog("Pairing");
        assertFocusedButton("Paste pairing text");
        assertStableDialog("Pairing");

        // This second task event must survive the first real JSON acknowledgment.
        nativeBack();
        awaitNoDialog();
        assertFocusedButton("Pair this device");
        assertForeground();

        tapButton("Pair this device");
        awaitDialog("Pairing");
        awaitIme(false);
        tapButton("Paste pairing text");
        awaitDialog("Paste pairing text");
        awaitDraft();
        logGeometry("retained-draft-after-native-back");
    }

    @Test
    public void displayedQrBackReturnsOneLevelAndNewActivityBecomesReadyAfterDisposal() throws Exception {
        openPairing();
        nativeBack();
        awaitNoDialog();
        assertFocusedButton("Pair this device");
        // Exercise destruction of the old real plugin/document followed by actual readiness.
        // Draft survival across Activity/WebView destruction is deliberately not promised.
        scenario.recreate();
        await("recreated production workspace ready", "document.querySelector('nav[aria-label=\"Clipp destinations\"]') !== null");
        openPairing();
        awaitIme(false);
        tapButton("Show my QR");
        awaitDialog("Pair this device");
        await("actual generated QR displayed", "(() => { const image = document.querySelector('img[alt=\"Pairing QR\"]'); return !!image && image.complete && image.naturalWidth > 0; })()");
        awaitIme(false);
        logGeometry("displayed-qr");

        nativeBack();
        awaitDialog("Pairing");
        assertFocusedButton("Show my QR");
        assertStableDialog("Pairing");
        nativeBack();
        awaitNoDialog();
        // The retained chooser still belongs to its original Devices invoker.
        assertFocusedButton("Pair this device");
        assertForeground();
    }

    /** Diagnostic observation only: a successful witness is not healthy startup acceptance. */
    @Test
    public void recordsRenderedStartupIssueDetailsForRootDiagnosis() throws Exception {
        Assume.assumeTrue("Root must additionally opt in with -e startupIssuesDiagnostic true",
            "true".equals(InstrumentationRegistry.getArguments().getString("startupIssuesDiagnostic")));
        await("actual public startup issue summary", "!!document.querySelector('button.issue-summary')");
        tap("document.querySelector('button.issue-summary')");
        awaitDialog("Issues and recovery");
        await("rendered issue message", "[...document.querySelectorAll('.recovery-issue p')].some(e=>e.getClientRects().length && e.innerText.trim().length>0)");
        String closedTechnicalDetails = "[...document.querySelectorAll('.recovery-issue details > summary')].find(e=>!e.parentElement.open && e.getClientRects().length)";
        for (int index = 0; index < 3; index++) {
            if (!"true".equals(evaluate("!!(" + closedTechnicalDetails + ")"))) break;
            // Real pointer input opens the public disclosure; no DOM open/click mutation.
            tap(closedTechnicalDetails);
        }
        String observation = input.startupIssueDiagnostics();
        // Bound every log line below Android's limit even for non-ASCII public text.
        for (int offset = 0; offset < observation.length(); offset += 1000)
            Log.i("ClippStartupIssues", "part=" + (offset / 1000) + ";" + observation.substring(offset, Math.min(offset + 1000, observation.length())));
        assertForeground();
    }

    @Test
    public void realRejectedDeviceNameSaveRetainsNewerDraftAcrossNativeBackAndThenSaves() throws Exception {
        tapButton("Devices");
        tapButton("Rename this device");
        awaitDialog("Device Name");
        replaceDeviceName("   ");
        tapButton("Save Device Name");
        await("real client whitespace rejection", "[...document.querySelectorAll('[role=alert]')].some(e=>e.getClientRects().length && e.textContent.trim()==='Device Name must contain 1–64 characters without control or line breaks. Edit and Save again.')");
        awaitDeviceName("   ");
        await("rejected name returns editor focus", "document.activeElement?.getAttribute('aria-label')==='Device Name'");
        String newer = "Native saved name";
        replaceDeviceName(newer);
        nativeBack();
        awaitIme(false);
        assertStableDialog("Device Name");
        awaitDeviceName(newer);
        nativeBack();
        awaitNoDialog();
        assertFocusedButton("Rename this device");
        tapButton("Rename this device");
        awaitDialog("Device Name");
        awaitDeviceName(newer);
        tap("document.querySelector('input[aria-label=\"Device Name\"]')");
        awaitIme(true);
        nativeBack();
        awaitIme(false);
        tapButton("Save Device Name");
        awaitNoDialog();
        assertFocusedButton("Rename this device");
        await("authoritative saved Device Name visible", "document.querySelector('.peer-item.active .peer-name')?.getAttribute('title') === " + JSONObject.quote(newer));
        logGeometry("real-rejected-then-saved-device-name");
    }

    /** Combined focus-loss/return baseline evidence; no private poll/read-attempt oracle. */
    @Test
    public void guestClipboardFocusLossAndNativeSettingsReturnEstablishBaselinesWithoutDuplicateClips() throws Exception {
        String prefix = "native-focus-" + java.util.UUID.randomUUID().toString().substring(0, 8);
        String active = prefix + "-active", dialog = prefix + "-dialog", returned = prefix + "-returned";
        String paused = prefix + "-paused", resumed = prefix + "-resumed";
        tapButton("Settings");
        await("applied Auto Sync enabled", "document.querySelector('select#auto-sync')?.value==='enabled' && !document.querySelector('select#auto-sync').disabled");
        await("background mode initially disabled", "document.body.innerText.includes('Background mode is disabled.')");
        tapButton("History");
        // Let the actual focused runtime establish its initial observation baseline.
        assertHistoryCountForInterval(active, 0, CAPTURE_QUIET_MS);
        writeGuestClipboard(active);
        awaitHistoryCount(active, 1);

        tapButton("Settings");
        tapButton("Enable background mode");
        awaitNativeOptInDialog();
        awaitActivityState(true, false);
        writeGuestClipboard(dialog);
        // Native JS confirmation may suspend WebView evaluation. Observe native
        // lifecycle/focus only while held, for >3 actual 1500ms polling intervals.
        long heldUntil = SystemClock.uptimeMillis() + CAPTURE_QUIET_MS;
        do {
            assertActivityState(true, false);
            SystemClock.sleep(100);
        } while (SystemClock.uptimeMillis() < heldUntil);
        tapNativeOptInCancel();
        awaitActivityState(true, true);
        await("Cancel preserved disabled background mode", "document.body.innerText.includes('Background mode is disabled.')");
        tapButton("History");
        assertHistoryCountForInterval(dialog, 0, CAPTURE_QUIET_MS);
        assertEquals("Initial foreground Clip must remain single", "1", evaluate(historyCount(active)));
        writeGuestClipboard(returned);
        awaitHistoryCount(returned, 1);
        assertHistoryCountForInterval(returned, 1, CAPTURE_QUIET_MS);

        tapButton("Settings");
        tapButton("Notification settings");
        awaitActivityState(false, false);
        awaitNativeSettings();
        writeGuestClipboard(paused);
        SystemClock.sleep(CAPTURE_QUIET_MS);
        assertActivityState(false, false);
        nativeBack();
        awaitActivityState(true, true);
        logGuestNativeWindows("external-settings-return-before-history");
        try {
            dismissGuestClipboardOverlayIfPresent();
            tapButton("History");
        } catch (Exception | AssertionError failure) {
            logGuestNativeWindows("external-settings-return-history-tap-failed");
            logGuestCaptureFailure();
            throw failure;
        }
        assertHistoryCountForInterval(paused, 0, CAPTURE_QUIET_MS);
        writeGuestClipboard(resumed);
        awaitHistoryCount(resumed, 1);
        assertHistoryCountForInterval(resumed, 1, CAPTURE_QUIET_MS);
        assertEquals("Earlier real capture must not duplicate after resume", "1", evaluate(historyCount(returned)));
        Log.i("ClippGuestCapture", "combinedNativeFocusLossAndReturnBaseline=true;externalSettingsPauseResume=true;privatePollAttemptsInspected=false;pollIntervalMs=1500;heldMs=" + CAPTURE_QUIET_MS);
    }

    private void replaceDeviceName(String value) throws Exception {
        tap("document.querySelector('input[aria-label=\"Device Name\"]')");
        awaitIme(true);
        long keys = SystemClock.uptimeMillis();
        KeyEvent selectDown = new KeyEvent(keys, keys, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_A, 0, KeyEvent.META_CTRL_ON);
        KeyEvent selectUp = new KeyEvent(keys, keys, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_A, 0, KeyEvent.META_CTRL_ON);
        selectDown.setSource(InputDevice.SOURCE_KEYBOARD);
        selectUp.setSource(InputDevice.SOURCE_KEYBOARD);
        instrumentation.sendKeySync(selectDown);
        instrumentation.sendKeySync(selectUp);
        instrumentation.sendStringSync(value);
        awaitDeviceName(value);
    }

    private void awaitDeviceName(String value) throws Exception {
        await("raw Device Name retained", "document.querySelector('input[aria-label=\"Device Name\"]')?.value === " + JSONObject.quote(value));
    }

    private String historyCount(String marker) {
        return "[...document.querySelectorAll('[data-session-scroll=\"history\"] article[data-clip-id] .history-text')].filter(e=>e.getClientRects().length && e.textContent===" + JSONObject.quote(marker) + ").length";
    }

    private void awaitHistoryCount(String marker, int count) throws Exception {
        await("actual visible History marker count " + count, historyCount(marker) + " === " + count);
    }

    private void assertHistoryCountForInterval(String marker, int count, long duration) throws Exception {
        await("History is the visible destination", "document.querySelector('nav button[aria-current=\"page\"]')?.textContent.trim()==='History'");
        long deadline = SystemClock.uptimeMillis() + duration;
        do {
            String actual = evaluate(historyCount(marker));
            if (!String.valueOf(count).equals(actual)) logGuestCaptureFailure();
            assertEquals("Public History must retain exact marker count", String.valueOf(count), actual);
            assertForeground();
            SystemClock.sleep(100);
        } while (SystemClock.uptimeMillis() < deadline);
    }

    private void writeGuestClipboard(String marker) {
        requireGuestClipboardInterval();
        ClipboardManager clipboard = (ClipboardManager) instrumentation.getTargetContext().getSystemService(Context.CLIPBOARD_SERVICE);
        guestCaptureEvents += "clipboard-write:" + marker + "@" + System.currentTimeMillis() + ";";
        clipboard.setPrimaryClip(ClipData.newPlainText("Clipp isolated guest acceptance", marker));
    }

    private void logGuestCaptureFailure() throws Exception {
        Log.i("ClippGuestCapture", "failureOnlyNativeEvents=" + guestCaptureEvents);
        Log.i("ClippGuestCapture", "publicHistory=" + evaluate("JSON.stringify([...document.querySelectorAll('[data-session-scroll=\"history\"] article[data-clip-id]')].filter(e=>e.getClientRects().length).slice(0,12).map(e=>({id:e.getAttribute('data-clip-id'),time:e.querySelector('.meta-time')?.textContent?.slice(0,80)})))"));
    }

    /** Window geometry and native IDs only; no SystemUI clipboard payload text. */
    private void logGuestNativeWindows(String phase) {
        requireGuestClipboardInterval();
        int windows = 0;
        for (AccessibilityWindowInfo window : instrumentation.getUiAutomation().getWindows()) {
            if (++windows > 12) break;
            Rect bounds = new Rect();
            window.getBoundsInScreen(bounds);
            AccessibilityNodeInfo root = window.getRoot();
            String owner = root == null ? "unavailable" : String.valueOf(root.getPackageName());
            Log.i("ClippGuestWindows", phase + ";window=" + window.getId() + ";type=" + window.getType()
                + ";layer=" + window.getLayer() + ";active=" + window.isActive() + ";focused=" + window.isFocused()
                + ";bounds=" + bounds.toShortString() + ";package=" + owner);
            if (root != null && "com.android.systemui".equals(owner)) logGuestSystemUiNodes(root, 0, new int[] { 0 });
        }
    }

    private void logGuestSystemUiNodes(AccessibilityNodeInfo node, int depth, int[] visited) {
        if (node == null || depth > 10 || visited[0]++ >= 64) return;
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        Log.i("ClippGuestWindows", "depth=" + depth + ";id=" + node.getViewIdResourceName() + ";class=" + node.getClassName()
            + ";bounds=" + bounds.toShortString() + ";visible=" + node.isVisibleToUser() + ";enabled=" + node.isEnabled()
            + ";clickable=" + node.isClickable() + ";focused=" + node.isFocused());
        for (int index = 0; index < node.getChildCount() && visited[0] < 64; index++)
            logGuestSystemUiNodes(node.getChild(index), depth + 1, visited);
    }

    private AccessibilityNodeInfo guestClipboardOverlay() {
        requireGuestClipboardInterval();
        boolean appObserved = false;
        AccessibilityNodeInfo overlay = null;
        int windows = 0;
        for (AccessibilityWindowInfo window : instrumentation.getUiAutomation().getWindows()) {
            assertTrue("Native window inventory must remain bounded", ++windows <= 12);
            AccessibilityNodeInfo root = window.getRoot();
            if (root == null) continue;
            String owner = String.valueOf(root.getPackageName());
            if (instrumentation.getTargetContext().getPackageName().equals(owner)) appObserved = true;
            if (!"com.android.systemui".equals(owner)) continue;
            for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByViewId("com.android.systemui:id/clipboard_ui")) {
                if (!node.isVisibleToUser()) continue;
                assertTrue("Only one visible SystemUI clipboard overlay is supported", overlay == null);
                overlay = node;
            }
        }
        assertTrue("Actual app window must witness that native overlay inventory is available", appObserved);
        return overlay;
    }

    /** Real OS dismissal of the proven overlay caused by this guest's synthetic write. */
    private void dismissGuestClipboardOverlayIfPresent() {
        AccessibilityNodeInfo overlay = guestClipboardOverlay();
        if (overlay == null) return;
        AccessibilityNodeInfo dismiss = null;
        for (AccessibilityNodeInfo node : overlay.findAccessibilityNodeInfosByViewId("com.android.systemui:id/dismiss_button")) {
            if (!node.isVisibleToUser() || !node.isEnabled() || !node.isClickable()
                || !"com.android.systemui".equals(String.valueOf(node.getPackageName()))) continue;
            assertTrue("Clipboard overlay must expose one unambiguous dismiss button", dismiss == null);
            dismiss = node;
        }
        assertTrue("Visible clipboard_ui must expose its real dismiss button", dismiss != null);
        assertTrue("Observed clipboard dismiss must remain visible before its one physical tap", dismiss.refresh() && dismiss.isVisibleToUser());
        Rect bounds = new Rect();
        dismiss.getBoundsInScreen(bounds);
        assertTrue("Native clipboard dismiss must have visible bounds", !bounds.isEmpty());
        long down = SystemClock.uptimeMillis();
        for (int action : new int[] { MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP }) {
            MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, bounds.exactCenterX(), bounds.exactCenterY(), 0);
            event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            try { assertTrue("Android must accept the real clipboard-overlay dismiss pointer", instrumentation.getUiAutomation().injectInputEvent(event, true)); }
            finally { event.recycle(); }
            SystemClock.sleep(40);
        }
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        while (guestClipboardOverlay() != null) {
            assertTrue("Real SystemUI clipboard overlay must disappear after one physical dismiss", SystemClock.uptimeMillis() < deadline);
            SystemClock.sleep(50);
        }
        assertActivityState(true, true);
        Log.i("ClippGuestCapture", "testSetup=physical-dismiss-of-owned-guest-synthetic-clipboard-overlay;clipboardChanged=false");
    }

    private void requireGuestClipboardInterval() {
        NativeAcceptanceTarget.requireIsolated(instrumentation.getTargetContext().getPackageName());
        Assume.assumeTrue("Root must separately authorize -e guestClipboardAcceptance true with host clipboard integration disabled",
            "true".equals(InstrumentationRegistry.getArguments().getString("guestClipboardAcceptance")));
        assertTrue("Guest clipboard qualification refuses physical/operator devices",
            "ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE));
    }

    private void awaitActivityState(boolean resumed, boolean focused) {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        AtomicBoolean focus = new AtomicBoolean();
        do {
            scenario.onActivity(activity -> focus.set(activity.hasWindowFocus()));
            if ((scenario.getState() == Lifecycle.State.RESUMED) == resumed && focus.get() == focused) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        assertActivityState(resumed, focused);
    }

    private void assertActivityState(boolean resumed, boolean focused) {
        assertEquals("Actual Activity resumed state", resumed, scenario.getState() == Lifecycle.State.RESUMED);
        AtomicBoolean focus = new AtomicBoolean();
        scenario.onActivity(activity -> focus.set(activity.hasWindowFocus()));
        assertEquals("Actual main-window focus", focused, focus.get());
    }

    private AccessibilityNodeInfo nativeOptInMessage() {
        AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
        if (root == null) return null;
        for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByText("Enable experimental background continuity?"))
            if (node.isVisibleToUser() && instrumentation.getTargetContext().getPackageName().equals(String.valueOf(node.getPackageName()))) return node;
        return null;
    }

    private void awaitNativeOptInDialog() {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        while (nativeOptInMessage() == null && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(50);
        assertTrue("Actual production native confirmation must own focus", nativeOptInMessage() != null);
    }

    private void tapNativeOptInCancel() {
        awaitNativeOptInDialog();
        AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
        AccessibilityNodeInfo cancel = null;
        for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByViewId("android:id/button2"))
            if (node.isVisibleToUser() && node.isEnabled() && instrumentation.getTargetContext().getPackageName().equals(String.valueOf(node.getPackageName()))) cancel = node;
        assertTrue("Native opt-in Cancel button must be present", cancel != null);
        Rect bounds = new Rect();
        cancel.getBoundsInScreen(bounds);
        assertTrue("Native Cancel must have visible bounds", !bounds.isEmpty());
        guestCaptureEvents += "native-cancel@" + System.currentTimeMillis() + ";";
        long down = SystemClock.uptimeMillis();
        for (int action : new int[] { MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP }) {
            MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, bounds.exactCenterX(), bounds.exactCenterY(), 0);
            event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            try { assertTrue("Android must accept the real Cancel pointer", instrumentation.getUiAutomation().injectInputEvent(event, true)); }
            finally { event.recycle(); }
            SystemClock.sleep(40);
        }
        instrumentation.waitForIdleSync();
    }

    private void awaitNativeSettings() {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
            if (root != null && "com.android.settings".equals(String.valueOf(root.getPackageName()))) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Actual Android Settings Activity must be foreground before external pause setup");
    }

    private void openPairing() throws Exception {
        tapButton("Devices");
        await("Devices selected by one native tap", "document.querySelector('nav button[aria-current=\"page\"]')?.textContent.trim() === 'Devices'");
        tapButton("Pair this device");
        awaitDialog("Pairing");
        assertForeground();
    }

    private void nativeBack() {
        // Inject a genuine Android key event into the focused window. Never invoke
        // OnBackPressedDispatcher, PluginCall, JS callbacks or DOM KeyboardEvent.
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        instrumentation.waitForIdleSync();
    }

    private String button(String name) { return input.button(name); }

    private void tapButton(String name) throws Exception { tap(button(name)); }

    private void tap(String element) throws Exception { input.tap(element); }

    private String dialogTitle() {
        return "(() => { const d = document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]'); return d ? document.getElementById(d.getAttribute('aria-labelledby'))?.textContent.trim() : null; })()";
    }

    private void awaitDialog(String title) throws Exception {
        await("dialog " + title, dialogTitle() + " === " + JSONObject.quote(title));
        assertForeground();
    }

    private void assertStableDialog(String title) throws Exception {
        // Allow the real asynchronous acknowledgment to settle and catch double dismissal.
        long until = SystemClock.uptimeMillis() + 400;
        do {
            assertEquals(title, evaluate(dialogTitle()));
            assertForeground();
            SystemClock.sleep(40);
        } while (SystemClock.uptimeMillis() < until);
    }

    private void awaitNoDialog() throws Exception {
        await("task dismissed", dialogTitle() + " === null");
        SystemClock.sleep(400);
        assertEquals("null", evaluate(dialogTitle()));
        assertForeground();
    }

    private void assertFocusedButton(String name) throws Exception {
        await("focus returned to " + name, "document.activeElement === (" + button(name) + ")");
    }

    private void awaitDraft() throws Exception {
        await("synthetic draft retained", "document.querySelector('textarea[aria-label=\"Pairing text\"]')?.value === " + JSONObject.quote(DRAFT));
    }

    private void awaitIme(boolean visible) throws Exception {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        AtomicReference<Boolean> actual = new AtomicReference<>();
        do {
            scenario.onActivity(activity -> {
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(activity.getBridge().getWebView());
                actual.set(insets == null ? null : insets.isVisible(WindowInsetsCompat.Type.ime()));
            });
            if (actual.get() != null && actual.get() == visible) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Expected native IME visible=" + visible + ", actual=" + actual.get()
            + "; run on a device with an enabled software keyboard; " + timeoutDiagnostics());
    }

    private void assertForeground() {
        AtomicBoolean focused = new AtomicBoolean();
        scenario.onActivity(activity -> focused.set(activity.hasWindowFocus() && !activity.isFinishing()));
        assertTrue("Back must leave this task's Activity in the foreground", focused.get());
    }

    private void await(String description, String expression) throws Exception {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            if ("true".equals(evaluate(expression))) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Timed out: " + description + "; " + timeoutDiagnostics());
    }

    private String timeoutDiagnostics() throws Exception { return input.timeoutDiagnostics(); }

    private String evaluate(String expression) throws Exception { return input.evaluate(expression); }

    private void logGeometry(String phase) throws Exception {
        scenario.onActivity(activity -> {
            WebView web = activity.getBridge().getWebView();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(web);
            Log.i("ClippHostTaskInput", "phase=" + phase + ";webViewPx=" + web.getWidth() + "x" + web.getHeight()
                + ";density=" + activity.getResources().getDisplayMetrics().density
                + ";fontScale=" + activity.getResources().getConfiguration().fontScale
                + ";imeVisible=" + (insets == null ? "unknown" : insets.isVisible(WindowInsetsCompat.Type.ime())));
        });
        Log.i("ClippHostTaskInput", "phase=" + phase + ";css=" + evaluate("JSON.stringify({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})"));
    }
}
