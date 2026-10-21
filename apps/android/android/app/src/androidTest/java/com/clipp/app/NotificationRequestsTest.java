package com.clipp.app;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.core.app.NotificationManagerCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
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

    @Before
    public void requireFreshRootAssignedGenuinePeer() throws Exception {
        Context context = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(context.getPackageName());
        Bundle args = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Explicit root genuine notification interval required",
            "true".equals(args.getString("notificationGenuinePeerAcceptance")));
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
        assertEquals("Pairing channel, not continuity", "default", posted.getNotification().getChannelId());
        assertEquals("Arrival alone cannot replace dirty editor", draft, web.evaluate(textarea + ".value"));
        assertEquals("Arrival keeps the task visible", "Paste pairing text", web.evaluate(
            "(() => { const d=document.querySelector('[role=dialog][aria-modal=true]'); return d ? document.getElementById(d.getAttribute('aria-labelledby'))?.textContent : null; })()"));
        try (ParcelFileDescriptor ignored = instrumentation.getUiAutomation().executeShellCommand("cmd statusbar expand-notifications")) {}
        tapActualPeerNotification();
        String card = "[...document.querySelectorAll('.pending-card')].find(e => e.querySelector('.peer-sub')?.getAttribute('title') === " + JSONObject.quote(peerId) + ")";
        web.await("actual authoritative Requests after OS selection", "document.querySelector('h1')?.textContent === 'Requests' && !!(" + card + ") && !document.querySelector('[role=dialog][aria-modal=true]')");
        web.await("current request remains unadmitted", "[...(" + card + ").querySelectorAll('button')].some(e => e.textContent.trim() === 'Accept' && !e.disabled)");
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        web.await("normal native Back restores same dirty editor", "!!(" + textarea + ") && " + textarea + ".value === " + JSONObject.quote(draft));
        Log.i(TAG, "genuine-notification-requests-back-pass nonce=" + nonce + " notificationId=" + posted.getId());
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

    private void tapActualPeerNotification() {
        long end = SystemClock.uptimeMillis() + 5000;
        do {
            AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
            if (root != null && "com.android.systemui".equals(String.valueOf(root.getPackageName()))) {
                for (AccessibilityNodeInfo text : root.findAccessibilityNodeInfosByText(peerName)) {
                    AccessibilityNodeInfo row = text;
                    while (row != null && !row.isClickable()) row = row.getParent();
                    if (row != null && row.isVisibleToUser()) {
                        assertTrue("Actual SystemUI notification click must be accepted",
                            row.performAction(AccessibilityNodeInfo.ACTION_CLICK));
                        return;
                    }
                }
            }
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        throw new AssertionError("Actual visible SystemUI peer notification row required");
    }
}
