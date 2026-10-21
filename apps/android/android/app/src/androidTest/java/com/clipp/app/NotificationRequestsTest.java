package com.clipp.app;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.content.Context;
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
import androidx.core.app.NotificationManagerCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
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
            logOwnNotificationEligibility("row-failure", posted);
            throw failure;
        }
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

    // Only these literal resource identifiers enter the aggregate output. Exploratory
    // SystemUI IDs are presence probes, not assumed guest structure or selectors.
    private static final String[] CENSUS_IDS = {
        "com.android.systemui:id/legacy_window_root",
        "android:id/notification_header", "android:id/notification_top_line",
        "android:id/notification_main_column", "android:id/notification_headerless_view_row",
        "android:id/notification_headerless_view_column", "android:id/app_name_text",
        "android:id/title", "android:id/text", "android:id/big_text",
        "android:id/expand_button", "android:id/expand_button_touch_container",
        "com.android.systemui:id/notification_stack_scroller",
        "com.android.systemui:id/notification_panel",
        "com.android.systemui:id/notification_container_parent",
        "com.android.systemui:id/notification_children_container"
    };

    private interface CensusRead<T> { T read(); }

    private static final class CensusBudget {
        final long end;
        int visited;
        boolean timeCapped, nodeCapped, depthCapped, childCapped;
        CensusBudget(long rowEnd) { end = Math.min(rowEnd, SystemClock.uptimeMillis() + 100); }
        void check() {
            if (SystemClock.uptimeMillis() >= end) {
                timeCapped = true;
                throw new CensusLimit();
            }
        }
        <T> T read(CensusRead<T> operation) {
            check();
            T value = operation.read();
            // A framework call cannot be interrupted by this guard. If it returns
            // after the shared deadline, its result cannot establish completeness.
            try {
                check();
                return value;
            } catch (CensusLimit limit) {
                if (value instanceof AccessibilityNodeInfo) ((AccessibilityNodeInfo) value).recycle();
                throw limit;
            }
        }
    }

    private static final class CensusLimit extends RuntimeException {}

    private static int censusId(String id) {
        for (int index = 0; index < CENSUS_IDS.length; index++) if (CENSUS_IDS[index].equals(id)) return index;
        return -1;
    }

    private JSONObject censusNodeMetadata(AccessibilityNodeInfo node, CensusBudget budget) throws Exception {
        JSONObject metadata = new JSONObject();
        String id = budget.read(node::getViewIdResourceName);
        metadata.put("resourceId", censusId(id) < 0 ? "<other>" : id);
        String packageName = String.valueOf(budget.read(node::getPackageName));
        metadata.put("package", packageName.equals("com.android.systemui") || packageName.equals("android")
            || packageName.equals("com.clipp.app.acceptance") ? packageName : "<other>");
        String className = String.valueOf(budget.read(node::getClassName));
        metadata.put("class", className.startsWith("android.") || className.startsWith("com.android.systemui.")
            || className.startsWith("com.android.internal.") ? safeMetadata(className) : "<other>");
        metadata.put("visible", budget.read(node::isVisibleToUser));
        metadata.put("enabled", budget.read(node::isEnabled));
        metadata.put("clickable", budget.read(node::isClickable));
        metadata.put("actionMask", budget.read(node::getActions));
        return metadata;
    }

    private void visitCensusNode(AccessibilityNodeInfo node, int depth, String ownPackage,
            CensusBudget budget, int[][] counts, List<AccessibilityNodeInfo> path,
            JSONArray ownedChains, int[] comparisons) throws Exception {
        budget.check();
        if (budget.visited == 128) { budget.nodeCapped = true; throw new CensusLimit(); }
        budget.visited++;
        path.add(node);
        try {
            String id = budget.read(node::getViewIdResourceName);
            int known = censusId(id);
            String packageName = String.valueOf(budget.read(node::getPackageName));
            boolean own = ownPackage.equals(packageName);
            if (known >= 0) {
                counts[known][0]++;
                if (budget.read(node::isVisibleToUser)) counts[known][1]++;
                if (budget.read(node::isEnabled)) counts[known][2]++;
                if (budget.read(node::isClickable)) counts[known][3]++;
            }
            boolean ownAnchor = own && known >= 0;
            if (ownAnchor) comparisons[4]++;
            if ("android:id/app_name_text".equals(id)) {
                // Compare the fixed app-header field, never log a label or description.
                CharSequence label = budget.read(node::getText);
                if ("Clipp".contentEquals(label == null ? "" : label)) comparisons[0]++;
            }
            if ("android:id/title".equals(id)) {
                CharSequence title = budget.read(node::getText);
                if ("Pairing request".contentEquals(title == null ? "" : title)) comparisons[1]++;
            }
            if (own && ("android:id/text".equals(id) || "android:id/big_text".equals(id))) {
                CharSequence value = budget.read(node::getText);
                comparisons[5]++;
                String text = value == null ? "" : value.toString();
                if (text.contains(peerName)) comparisons[2]++;
                if (text.contains(peerId)) comparisons[3]++;
            }
            if (ownAnchor && ownedChains.length() < 4) {
                JSONArray chain = new JSONArray();
                for (int index = path.size() - 1; index >= Math.max(0, path.size() - 6); index--) {
                    chain.put(censusNodeMetadata(path.get(index), budget));
                }
                ownedChains.put(chain);
            }
            int children = budget.read(node::getChildCount);
            if (depth == 10) { if (children > 0) budget.depthCapped = true; return; }
            if (children > 16) budget.childCapped = true;
            for (int index = 0; index < Math.min(16, children); index++) {
                if (budget.visited == 128) { budget.nodeCapped = true; throw new CensusLimit(); }
                final int childIndex = index;
                AccessibilityNodeInfo child = budget.read(() -> node.getChild(childIndex));
                if (child != null) try {
                    visitCensusNode(child, depth + 1, ownPackage, budget, counts, path, ownedChains, comparisons);
                } finally {
                    // Always release acquired nodes, even after the observation deadline.
                    child.recycle();
                }
            }
        } finally {
            path.remove(path.size() - 1);
        }
    }

    private void logSystemUiCensus(AccessibilityNodeInfo root, long rowEnd, String stage) {
        CensusBudget budget = new CensusBudget(rowEnd);
        int[][] counts = new int[CENSUS_IDS.length][4];
        JSONArray ownedChains = new JSONArray();
        int[] comparisons = new int[6];
        String errorClass = "none";
        try {
            Context context = budget.read(instrumentation::getTargetContext);
            String ownPackage = budget.read(context::getPackageName);
            visitCensusNode(root, 0, ownPackage, budget, counts, new ArrayList<>(), ownedChains, comparisons);
        } catch (CensusLimit limit) {
            // Bounds are diagnostic UNKNOWN, never evidence of an absent owned row.
        } catch (Exception error) {
            errorClass = safeMetadata(error.getClass().getSimpleName());
        }
        Log.i(TAG, "systemui-census nonce=" + nonce + " stage=" + stage
            + " observation=" + (budget.timeCapped || budget.nodeCapped || budget.depthCapped
                || budget.childCapped || !"none".equals(errorClass) ? "UNKNOWN" : "complete")
            + " visited=" + budget.visited + " timeCapped=" + budget.timeCapped
            + " nodeCapped=" + budget.nodeCapped + " depthCapped=" + budget.depthCapped
            + " childCapped=" + budget.childCapped + " errorClass=" + errorClass
            + " exactOwnLabelHeaders=" + comparisons[0] + " exactRequestTitleNodes=" + comparisons[1]
            + " ownBodyPeerNameNodes=" + comparisons[2] + " ownBodyPeerIdNodes=" + comparisons[3]
            + " ownBodyComparedNodes=" + comparisons[5] + " ownedPackageAnchorCount=" + comparisons[4]
            + " ownedAnchorChains=" + ownedChains.length() + " anchorDetailsCapped=" + (comparisons[4] > 4));
        for (int index = 0; index < CENSUS_IDS.length; index++) {
            Log.i(TAG, "systemui-container nonce=" + nonce + " stage=" + stage + " id=" + CENSUS_IDS[index]
                + " count=" + counts[index][0] + " visible=" + counts[index][1]
                + " enabled=" + counts[index][2] + " clickable=" + counts[index][3]);
        }
        for (int index = 0; index < ownedChains.length(); index++) {
            Log.i(TAG, "systemui-owned-anchor nonce=" + nonce + " stage=" + stage
                + " anchorIndex=" + index + " metadata=" + ownedChains.optJSONArray(index));
        }
    }

    private void tapActualPeerNotification() {
        long end = SystemClock.uptimeMillis() + 5000;
        int emitted = 0;
        int censusCount = 0;
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
                if (systemUi && (censusCount == 0 || (censusCount == 1 && end - SystemClock.uptimeMillis() <= 150))) {
                    logSystemUiCensus(root, end, censusCount == 0 ? "first-systemui" : "last-available");
                    censusCount++;
                }
            } finally {
                for (AccessibilityNodeInfo text : matches) text.recycle();
                if (root != null) root.recycle();
            }
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        if (censusCount < 2) Log.i(TAG, "systemui-census nonce=" + nonce
            + " stage=final-failure observation=UNKNOWN reason=no-remaining-row-budget snapshots=" + censusCount);
        logPeerRowSnapshot("final-failure", latest);
        throw new AssertionError("Actual visible SystemUI peer notification row required");
    }
}
