package com.clipp.app;

import static org.junit.Assert.assertTrue;

import android.app.UiAutomation;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Observe the owning Activity and native accessible controls without the legacy NAF dumper. */
@RunWith(AndroidJUnit4.class)
public final class AcceptanceReadinessTest {
    private static final String PACKAGE = "com.clipp.app.acceptance";
    private static final int MAX_NODES = 256;
    private static final int MAX_DEPTH = 32;

    @Test
    public void bundledWebViewAcceptsNativeTab() throws Exception {
        NativeAcceptanceTarget.requireIsolated(
            InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName()
        );
        Snapshot before = null;
        Snapshot after = null;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            try {
                long deadline = SystemClock.elapsedRealtime() + 10000;
                String url;
                do {
                    url = owningUrl(scenario);
                    if (url != null && !"about:blank".equals(url)) break;
                    SystemClock.sleep(50);
                } while (SystemClock.elapsedRealtime() < deadline);
                assertTrue("Bundled WebView must own the focused Activity", url != null);
                requireBundledUrl(url);
                UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
                do {
                    assertTrue("Owning Activity changed", url.equals(owningUrl(scenario)));
                    before = snapshot(automation);
                    if (before.controls > 0) break;
                    SystemClock.sleep(50);
                } while (SystemClock.elapsedRealtime() < deadline);
                assertTrue("App interactive controls required", before != null && before.controls > 0);
                assertTrue("Owning Activity changed before input", url.equals(owningUrl(scenario)));
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_TAB);
                do {
                    assertTrue("Owning Activity changed after input", url.equals(owningUrl(scenario)));
                    after = snapshot(automation);
                    if (after.focus != null && !after.focus.equals(before.focus)) break;
                    SystemClock.sleep(50);
                } while (SystemClock.elapsedRealtime() < deadline);
                assertTrue("Native Tab must change the focused app control",
                    after != null && after.focus != null && !after.focus.equals(before.focus));
                assertTrue("Owning Activity changed after observation", url.equals(owningUrl(scenario)));
                Bundle status = new Bundle();
                status.putString("clipp_bundled_url", url);
                status.putString("clipp_ui_owner", PACKAGE + "/com.clipp.app.MainActivity");
                status.putString("clipp_ui_controls_ready", "true");
                status.putString("clipp_ui_focus_before", before.focus == null ? "none" : before.focus);
                status.putString("clipp_ui_focus_after", after.focus);
                status.putString("clipp_ui_input", "KEYCODE_TAB");
                InstrumentationRegistry.getInstrumentation().sendStatus(0, status);
            } finally {
                Bundle diagnostic = new Bundle();
                if (before != null) diagnostic.putString("clipp_ui_structure_before", before.nodes.toString());
                if (after != null) diagnostic.putString("clipp_ui_structure_after", after.nodes.toString());
                InstrumentationRegistry.getInstrumentation().sendStatus(0, diagnostic);
            }
        }
    }

    private static String owningUrl(ActivityScenario<MainActivity> scenario) {
        AtomicReference<String> url = new AtomicReference<>();
        scenario.onActivity(activity -> {
            NativeAcceptanceTarget.requireIsolated(activity.getPackageName());
            assertTrue("Expected owning Activity required", activity.getClass() == MainActivity.class);
            if (activity.hasWindowFocus() && activity.getBridge() != null) {
                String server = activity.getBridge().getServerUrl();
                assertTrue("Development server refused", server == null || server.isEmpty());
                url.set(activity.getBridge().getWebView().getUrl());
            }
        });
        return url.get();
    }

    private static void requireBundledUrl(String url) {
        Uri observed = Uri.parse(url);
        assertTrue("Bundled WebView origin required", "https".equals(observed.getScheme())
            && "localhost".equals(observed.getHost()) && observed.getPort() == -1);
        assertTrue("Bundled WebView entry required", (observed.getPath() == null
            || observed.getPath().isEmpty() || "/".equals(observed.getPath())
            || "/index.html".equals(observed.getPath())) && observed.getQuery() == null
            && observed.getFragment() == null);
    }

    private static final class Pending {
        final AccessibilityNodeInfo node;
        final int depth;
        Pending(AccessibilityNodeInfo node, int depth) { this.node = node; this.depth = depth; }
    }

    private static final class Snapshot {
        final JSONArray nodes = new JSONArray();
        int controls;
        String focus;
        int focusDepth = -1;
    }

    private static String bounded(CharSequence value) {
        String text = value == null ? "" : value.toString();
        return text.substring(0, Math.min(160, text.length()));
    }

    private static Snapshot snapshot(UiAutomation automation) throws Exception {
        Snapshot result = new Snapshot();
        AccessibilityNodeInfo root = automation.getRootInActiveWindow();
        if (root == null) return result;
        ArrayDeque<Pending> pending = new ArrayDeque<>();
        Set<AccessibilityNodeInfo> seen = new HashSet<>();
        List<AccessibilityNodeInfo> retained = new ArrayList<>();
        pending.add(new Pending(root, 0));
        try {
            assertTrue("Active accessible window must belong to acceptance app", PACKAGE.equals(bounded(root.getPackageName())));
            int visited = 0;
            while (!pending.isEmpty()) {
                Pending current = pending.removeLast();
                AccessibilityNodeInfo node = current.node;
                retained.add(node);
                assertTrue("Accessible traversal node bound exceeded", ++visited <= MAX_NODES);
                assertTrue("Accessible traversal depth bound exceeded", current.depth <= MAX_DEPTH);
                if (!seen.add(node)) continue;
                if (!PACKAGE.equals(bounded(node.getPackageName()))) continue;
                String type = bounded(node.getClassName());
                String resource = bounded(node.getViewIdResourceName());
                Rect bounds = new Rect();
                node.getBoundsInScreen(bounds);
                String rectangle = "[" + bounds.left + "," + bounds.top + "][" + bounds.right + "," + bounds.bottom + "]";
                JSONObject descriptor = new JSONObject();
                descriptor.put("class", type);
                descriptor.put("resource-id", resource);
                descriptor.put("bounds", rectangle);
                descriptor.put("focused", Boolean.toString(node.isFocused()));
                descriptor.put("clickable", Boolean.toString(node.isClickable()));
                descriptor.put("focusable", Boolean.toString(node.isFocusable()));
                result.nodes.put(descriptor);
                boolean control = !"android.webkit.WebView".equals(type) && node.isEnabled()
                    && node.isVisibleToUser() && node.isFocusable();
                if (control) {
                    result.controls++;
                    if (node.isFocused() && current.depth >= result.focusDepth) {
                        String identity = type + "\n" + resource + "\n" + rectangle + "\n"
                            + node.isClickable() + "\n" + node.isFocusable();
                        byte[] hash = MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8));
                        StringBuilder hex = new StringBuilder();
                        for (byte value : hash) hex.append(String.format("%02x", value & 0xff));
                        result.focus = hex.toString();
                        result.focusDepth = current.depth;
                    }
                }
                int count = node.getChildCount();
                assertTrue("Accessible child bound exceeded", count <= MAX_NODES - visited - pending.size());
                for (int index = count - 1; index >= 0; index--) {
                    AccessibilityNodeInfo child = node.getChild(index);
                    if (child != null) pending.add(new Pending(child, current.depth + 1));
                }
            }
            return result;
        } finally {
            for (AccessibilityNodeInfo node : retained) node.recycle();
            while (!pending.isEmpty()) pending.removeLast().node.recycle();
        }
    }
}
