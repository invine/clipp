package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Instrumentation;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Rect;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.Predicate;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Root-only opt-in qualification of packaged production UI, AndroidClient and native service.
 * Each method requires an isolated fresh acceptance app with Auto Sync initially enabled and
 * background mode disabled. Root preconfigures notification permission and owns the native /
 * clipboard interval: launching the real foreground runtime can start normal capture.
 *
 * UI and notification actions use physical Android pointers. DOM/accessibility reads only
 * locate or witness public controls. No bridge, store, service command, PendingIntent.send,
 * preference mutation or permission setup is installed here. A run is not process-restart,
 * stale-action, rejected-storage, real-recipient or OEM/Doze qualification.
 */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class ContinuityControlsInputTest {
    private static final long TIMEOUT_MS = 20_000;
    private static final String TITLE = "Clipp background continuity";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private ActivityScenario<MainActivity> scenario;
    private NativePublicWebView web;
    private NotificationManager notifications;
    private String notificationProfile;

    @Before
    public void requireExplicitRootIntervalAndPackagedIsolatedApp() throws Exception {
        Context context = instrumentation.getTargetContext();
        // Refuse the operator package even when the opt-in argument was omitted.
        NativeAcceptanceTarget.requireIsolated(context.getPackageName());
        Assume.assumeTrue("Root must opt in with -e continuityControlsAcceptance true",
            "true".equals(InstrumentationRegistry.getArguments().getString("continuityControlsAcceptance")));
        notificationProfile = InstrumentationRegistry.getArguments().getString("continuityNotificationProfile");
        assertTrue("Root must preconfigure and name allowed or blocked notification profile",
            "allowed".equals(notificationProfile) || "blocked".equals(notificationProfile));
        notifications = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        assertEquals("Notification setup is root-owned; test never grants/revokes permission",
            "allowed".equals(notificationProfile), notifications.areNotificationsEnabled());
        JSONObject config;
        try (InputStream stream = context.getAssets().open("capacitor.config.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
            config = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
        }
        JSONObject server = config.optJSONObject("server");
        assertTrue("Packaged production assets required; dev-server app refused", server == null || !server.has("url"));
        try (InputStream stream = context.getAssets().open("public/index.html")) {
            assertTrue("Packaged production index required", stream.read() != -1);
        }
        AccessibilityServiceInfo accessibility = instrumentation.getUiAutomation().getServiceInfo();
        accessibility.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        instrumentation.getUiAutomation().setServiceInfo(accessibility);
        launchSettings();
        awaitStatus("Background mode is disabled.");
        awaitAutoSync(true);
        assertNoNotification();
    }

    @After
    public void closeOnlyTheIsolatedActivity() {
        if (scenario != null) scenario.close();
    }

    @Test
    public void renderedOptInStartPauseResumeAndStopPreserveBothAutoSyncValuesAfterActivityReopen() throws Exception {
        Assume.assumeTrue("Run this method in root's allowed notification profile", "allowed".equals(notificationProfile));
        tapButton("Enable background mode");
        tapNativeDialogButton("android:id/button2"); // Cancel the genuine native JS confirm.
        awaitStatus("Background mode is disabled.");
        assertNoNotification();
        enable();
        awaitRunning(true);
        tapButton("Pause Auto Sync");
        awaitRunning(false);
        tapButton("Resume Auto Sync");
        awaitRunning(true);
        tapButton("Pause Auto Sync");
        awaitRunning(false);
        stopAndReopen(false);

        enable();
        awaitRunning(false);
        tapButton("Resume Auto Sync");
        awaitRunning(true);
        // Activity finish stops the actual service but retains enabled mode; reopen must
        // expose Start, without silently starting a new Activity-owned runtime service.
        reopenSettings();
        awaitStatus("Background mode is stopped.");
        awaitAutoSync(true);
        awaitButton("Start background mode");
        awaitNotificationAbsent();
        tapButton("Start background mode");
        awaitRunning(true);
        stopAndReopen(true);
    }

    @Test
    public void physicalNotificationPauseResumeAndStopReachTheRealClientAndSurviveActivityReopen() throws Exception {
        Assume.assumeTrue("Run this method in root's allowed notification profile", "allowed".equals(notificationProfile));
        enable();
        awaitRunning(true);
        tapNotificationAction("Pause Auto Sync");
        awaitRunning(false);
        tapNotificationAction("Resume Auto Sync");
        awaitRunning(true);
        tapNotificationAction("Stop background mode");
        awaitDisabled(true);
        reopenSettings();
        awaitDisabled(true);

        enable();
        awaitRunning(true);
        tapNotificationAction("Pause Auto Sync");
        awaitRunning(false);
        tapNotificationAction("Stop background mode");
        awaitDisabled(false);
        reopenSettings();
        awaitDisabled(false);
    }

    @Test
    public void blockedNotificationsDoNotGateOptInAndNativeSettingsReturnRetainsAppliedControls() throws Exception {
        Assume.assumeTrue("Root must configure blocked permission before this method", "blocked".equals(notificationProfile));
        awaitBlockedWarning();
        enable();
        // No notification assertion can establish visible SystemUI controls in this profile.
        awaitControl(true);
        awaitBlockedWarning();
        tapButton("Notification settings");
        awaitNative("Android notification settings opened", node ->
            "com.android.settings".equals(String.valueOf(node.getPackageName())));
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        instrumentation.waitForIdleSync();
        awaitForeground();
        awaitControl(true);
        awaitBlockedWarning();
        tapButton("Pause Auto Sync");
        awaitControl(false);
        tapButton("Stop background mode");
        awaitStatus("Background mode is disabled.");
        awaitAutoSync(false);
        reopenSettings();
        awaitStatus("Background mode is disabled.");
        awaitAutoSync(false);
        awaitBlockedWarning();
    }

    private void launchSettings() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        web = new NativePublicWebView(instrumentation, scenario);
        web.await("packaged workspace ready", "document.querySelector('nav[aria-label=\"Clipp destinations\"]') !== null");
        assertEquals("https://localhost/", web.evaluate("location.origin + '/'"));
        tapButton("Settings");
        web.await("Settings selected", "document.querySelector('nav button[aria-current=\"page\"]')?.textContent.trim() === 'Settings'");
        awaitButton("Background help and recovery");
        scenario.onActivity(activity -> Log.i("ClippContinuityInput", "windowPx="
            + activity.getWindowManager().getCurrentWindowMetrics().getBounds()
            + ";webViewPx=" + activity.getBridge().getWebView().getWidth() + "x" + activity.getBridge().getWebView().getHeight()
            + ";density=" + activity.getResources().getDisplayMetrics().density
            + ";fontScale=" + activity.getResources().getConfiguration().fontScale));
        Log.i("ClippContinuityInput", "css=" + web.evaluate("JSON.stringify({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})"));
    }

    private void reopenSettings() throws Exception {
        scenario.close();
        scenario = null;
        awaitNotificationAbsent();
        launchSettings();
    }

    private void enable() throws Exception {
        tapButton("Enable background mode");
        tapNativeDialogButton("android:id/button1");
    }

    private void stopAndReopen(boolean autoSync) throws Exception {
        tapButton("Stop background mode");
        awaitDisabled(autoSync);
        reopenSettings();
        awaitDisabled(autoSync);
    }

    private void awaitDisabled(boolean autoSync) throws Exception {
        awaitStatus("Background mode is disabled.");
        awaitAutoSync(autoSync);
        awaitButton("Enable background mode");
        web.await("disabled mode has no Pause/Resume or Stop", "![...document.querySelectorAll('button')].some(e => e.getClientRects().length && ['Pause Auto Sync','Resume Auto Sync','Stop background mode'].includes(e.textContent.trim()))");
        awaitNotificationAbsent();
    }

    private void awaitControl(boolean autoSync) throws Exception {
        awaitAutoSync(autoSync);
        String expected = autoSync ? "Pause Auto Sync" : "Resume Auto Sync";
        web.await("one applied-state control", "(() => { const a=[...document.querySelectorAll('button')].filter(e => e.getClientRects().length && ['Pause Auto Sync','Resume Auto Sync'].includes(e.textContent.trim())); return a.length===1 && !a[0].disabled && a[0].textContent.trim()===" + JSONObject.quote(expected) + "; })()");
        awaitButton("Stop background mode");
        awaitStatus(autoSync ? "Background mode is waiting." : "Background mode is paused.");
    }

    private void awaitRunning(boolean autoSync) throws Exception {
        awaitControl(autoSync);
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            Notification notification = continuityNotification();
            if (notification != null && actionTitles(notification).equals(Arrays.asList(
                autoSync ? "Pause Auto Sync" : "Resume Auto Sync", "Stop background mode"))) {
                assertEquals(autoSync ? "Waiting for trusted devices" : "Auto Sync is paused", notification.extras.getString(Notification.EXTRA_TEXT));
                assertTrue("Continuity notification is ongoing", (notification.flags & Notification.FLAG_ONGOING_EVENT) != 0);
                return;
            }
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Actual service notification did not match applied public UI; " + web.timeoutDiagnostics());
    }

    private void awaitAutoSync(boolean enabled) throws Exception {
        web.await("applied Auto Sync " + enabled, "document.querySelector('select#auto-sync')?.value === " + JSONObject.quote(enabled ? "enabled" : "disabled"));
    }

    private void awaitStatus(String text) throws Exception {
        web.await(text, "[...document.querySelectorAll('[role=status]')].some(e => e.getClientRects().length && e.textContent.trim() === " + JSONObject.quote(text) + ")");
    }

    private void awaitBlockedWarning() throws Exception {
        web.await("honest blocked notification warning", "document.body.innerText.includes('Notifications are blocked. Background mode remains available; reconnect alerts may not appear.')");
    }

    private void awaitButton(String name) throws Exception { web.await(name, "!!(" + web.button(name) + ")"); }
    private void tapButton(String name) throws Exception { web.tap(web.button(name)); }

    private Notification continuityNotification() {
        for (StatusBarNotification value : notifications.getActiveNotifications()) {
            if (TITLE.equals(value.getNotification().extras.getString(Notification.EXTRA_TITLE))) return value.getNotification();
        }
        return null;
    }

    private List<String> actionTitles(Notification notification) {
        List<String> titles = new ArrayList<>();
        if (notification.actions != null) for (Notification.Action action : notification.actions) titles.add(action.title.toString());
        return titles;
    }

    private void assertNoNotification() { assertTrue("No continuity service notification expected", continuityNotification() == null); }

    private void awaitNotificationAbsent() {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        while (continuityNotification() != null && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(50);
        assertNoNotification();
    }

    private void tapNativeDialogButton(String id) throws Exception {
        awaitNative("experimental continuity opt-in message", node -> node.getText() != null
            && node.getText().toString().startsWith("Enable experimental background continuity?"));
        AccessibilityNodeInfo button = awaitNative("genuine opt-in dialog " + id, node ->
            instrumentation.getTargetContext().getPackageName().equals(String.valueOf(node.getPackageName()))
                && id.equals(node.getViewIdResourceName()));
        tapNative(button);
        awaitForeground();
    }

    private void tapNotificationAction(String name) throws Exception {
        // Actual status-bar pointer gesture and actual SystemUI action target. Never send
        // the notification's PendingIntent ourselves or call the service/bridge directly.
        Rect display = new Rect();
        scenario.onActivity(activity -> display.set(activity.getWindowManager().getCurrentWindowMetrics().getBounds()));
        swipe(display.centerX(), display.top + 1, display.centerX(), display.top + display.height() * .72f);
        AccessibilityNodeInfo title = awaitNative("own continuity notification in SystemUI", node ->
            "com.android.systemui".equals(String.valueOf(node.getPackageName())) && TITLE.equals(String.valueOf(node.getText())));
        AccessibilityNodeInfo action = findInNotificationAncestors(title, node -> name.equals(String.valueOf(node.getText())));
        if (action == null) {
            // Locate the visible expand button only within the card containing our title.
            AccessibilityNodeInfo expand = findInNotificationAncestors(title, node -> node.getViewIdResourceName() != null
                && node.getViewIdResourceName().endsWith(":id/expand_button"));
            assertNotNull("SystemUI must expose this notification's expand control before tapping its action", expand);
            tapNative(expand);
            long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
            do {
                title = findNative(node -> "com.android.systemui".equals(String.valueOf(node.getPackageName())) && TITLE.equals(String.valueOf(node.getText())));
                action = findInNotificationAncestors(title, node -> name.equals(String.valueOf(node.getText())));
                if (action != null) break;
                SystemClock.sleep(50);
            } while (SystemClock.uptimeMillis() < deadline);
            assertNotNull("Visible action required in our actual SystemUI notification: " + name, action);
        }
        tapNative(action);
        // A service notification action usually leaves the shade open. Dismiss the real
        // shade with Back; the Activity stays the same consumer throughout the action.
        AccessibilityNodeInfo active = instrumentation.getUiAutomation().getRootInActiveWindow();
        if (active != null && "com.android.systemui".equals(String.valueOf(active.getPackageName()))) {
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            instrumentation.waitForIdleSync();
        }
        awaitForeground();
    }

    private AccessibilityNodeInfo findInNotificationAncestors(AccessibilityNodeInfo title, Predicate<AccessibilityNodeInfo> matches) {
        AccessibilityNodeInfo card = title;
        while (card != null) {
            String id = String.valueOf(card.getViewIdResourceName());
            String type = String.valueOf(card.getClassName());
            // Never ascend into the list and accidentally locate another notification's
            // identically named action or expand control.
            if (id.endsWith(":id/notification_stack_scroller") || type.endsWith("NotificationStackScrollLayout")) return null;
            AccessibilityNodeInfo found = findIn(card, matches);
            if (found != null) return found;
            card = card.getParent();
        }
        return null;
    }

    private AccessibilityNodeInfo findIn(AccessibilityNodeInfo node, Predicate<AccessibilityNodeInfo> matches) {
        if (node == null) return null;
        if (node.isVisibleToUser() && matches.test(node)) return node;
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo found = findIn(node.getChild(index), matches);
            if (found != null) return found;
        }
        return null;
    }

    private AccessibilityNodeInfo findNative(Predicate<AccessibilityNodeInfo> matches) {
        return findIn(instrumentation.getUiAutomation().getRootInActiveWindow(), matches);
    }

    private AccessibilityNodeInfo awaitNative(String description, Predicate<AccessibilityNodeInfo> matches) {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            AccessibilityNodeInfo found = findNative(matches);
            if (found != null) return found;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Timed out locating public native UI: " + description);
    }

    private void tapNative(AccessibilityNodeInfo node) {
        assertNotNull(node);
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        assertTrue("Native target must be visible and enabled", node.isVisibleToUser() && node.isEnabled() && !bounds.isEmpty());
        long down = SystemClock.uptimeMillis();
        pointer(MotionEvent.ACTION_DOWN, bounds.exactCenterX(), bounds.exactCenterY(), down);
        SystemClock.sleep(40);
        pointer(MotionEvent.ACTION_UP, bounds.exactCenterX(), bounds.exactCenterY(), down);
        instrumentation.waitForIdleSync();
    }

    private void swipe(float x1, float y1, float x2, float y2) {
        long down = SystemClock.uptimeMillis();
        pointer(MotionEvent.ACTION_DOWN, x1, y1, down);
        for (int step = 1; step <= 20; step++) {
            SystemClock.sleep(15);
            float fraction = step / 20f;
            pointer(MotionEvent.ACTION_MOVE, x1 + (x2 - x1) * fraction, y1 + (y2 - y1) * fraction, down);
        }
        pointer(MotionEvent.ACTION_UP, x2, y2, down);
        instrumentation.waitForIdleSync();
    }

    private void pointer(int action, float x, float y, long down) {
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            // Native dialogs and the notification shade can belong to another UID.
            // UiAutomation injects the genuine OS event; Instrumentation's app-only
            // sendPointerSync is intentionally retained for production WebView taps.
            assertTrue("Android must accept the native OS pointer event",
                instrumentation.getUiAutomation().injectInputEvent(event, true));
        } finally { event.recycle(); }
    }

    private void awaitForeground() {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        java.util.concurrent.atomic.AtomicBoolean focused = new java.util.concurrent.atomic.AtomicBoolean();
        do {
            scenario.onActivity(activity -> focused.set(activity.hasWindowFocus() && !activity.isFinishing()));
            if (focused.get()) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        assertTrue("Expected isolated MainActivity to regain foreground focus", focused.get());
    }
}
