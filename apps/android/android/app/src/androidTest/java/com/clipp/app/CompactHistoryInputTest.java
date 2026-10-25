package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.model.MultipleFailureException;

/**
 * Ordinary packaged MainActivity only. Root invokes the single method separately on four
 * fresh isolated profiles: native fontScale 1/2, portrait/landscape. Root owns APK provenance,
 * guest/network/clipboard isolation, actual global settings and their restoration, screenshots,
 * artifact extraction and the outer deadline. No SDK/guest operation is embedded here.
 *
 * Data enters through actual exported native text Intents. NativePublicWebView only locates
 * and observes public DOM; every action uses guarded physical pointers or Android keys.
 * ClipboardManager is the existing native system boundary: a known synthetic sentinel is
 * written before Copy and before any clipboard read. No private stores, React owners,
 * UiSession, product methods, bridge replacements or test globals are accessed.
 *
 * Copy equality and actual public feedback are required. A fresh Local Clip is not required;
 * neither successful Copy nor copied-without-clip establishes delivery to another device.
 */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class CompactHistoryInputTest {
    private static final long JOURNEY_MS = 180_000;
    private static final String CARDS = "[...document.querySelectorAll('.history-card[data-clip-id]')]";
    private static final String QUERY = "document.querySelector('input[aria-label=\"Search history\"]')";
    private static final String DIALOG = "document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]')";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final JSONArray observations = new JSONArray();
    private final JSONArray actionTargets = new JSONArray();
    private final JSONArray copies = new JSONArray();
    private final JSONArray screenshots = new JSONArray();
    private ActivityScenario<MainActivity> scenario;
    private NativePublicWebView web;
    private Context target;
    private File directory;
    private String nonce;
    private String profile;
    private String documentOrigin;
    private long deadline;
    private boolean passed;
    private boolean syntheticClipboardOwned;
    private int copySequence;
    private MainActivity owner;
    private android.webkit.WebView ownerWebView;

    @Before
    public void requireRootOwnedIsolatedOrdinaryProfile() throws Exception {
        Bundle arguments = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Explicit root-owned compact History interval required",
            "true".equals(arguments.getString("compactHistoryAcceptance")));
        target = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(target.getPackageName());
        nonce = arguments.getString("compactHistoryRootNonce", "");
        assertTrue("Fresh bounded synthetic interval nonce required", nonce.matches("[A-Za-z0-9_-]{16,64}"));
        String font = arguments.getString("compactHistoryFontScale", "");
        String orientation = arguments.getString("compactHistoryOrientation", "");
        assertTrue("Root supplies native font profile 1 or 2", "1".equals(font) || "2".equals(font));
        assertTrue("Root supplies actual portrait or landscape profile", "portrait".equals(orientation) || "landscape".equals(orientation));
        profile = "font" + font + "-" + orientation;
        JSONObject config = new JSONObject(readAsset("capacitor.config.json"));
        JSONObject server = config.optJSONObject("server");
        assertTrue("Ordinary packaged HTTPS assets required", server == null || (!server.has("url")
            && "localhost".equals(server.optString("hostname", "localhost"))
            && "https".equals(server.optString("androidScheme", "https"))));
        String index = readAsset("public/index.html");
        assertFalse("Owning/reset replacement entry refused", index.contains("clipp-reset-owning-manifest")
            || index.contains("__identityResetAcceptance") || index.contains("clipp-reset-owning-progress"));
        directory = new File(target.getCacheDir(), "compact21-" + nonce + "-" + profile);
        assertTrue("Preserve prior evidence; root must use a fresh nonce", !directory.exists() && directory.mkdir());
        deadline = SystemClock.uptimeMillis() + JOURNEY_MS;
        scenario = ActivityScenario.launch(MainActivity.class);
        web = new NativePublicWebView(instrumentation, scenario);
        await("ordinary native workspace", "!!document.querySelector('nav[aria-label=\"Clipp destinations\"]')"
            + " && document.documentElement.dataset.hostGeometry==='android' && document.fonts.status==='loaded'");
        assertEquals("Ordinary HTTPS origin", "https://localhost/", web.evaluate("location.origin+'/'"));
        web.onActivity(activity -> {
            owner = activity;
            ownerWebView = activity.getBridge().getWebView();
            assertEquals("Root must deliver the real native font preference", Float.parseFloat(font),
                activity.getResources().getConfiguration().fontScale, 0.001f);
            assertEquals("Root must deliver the declared native orientation",
                "portrait".equals(orientation) ? Configuration.ORIENTATION_PORTRAIT : Configuration.ORIENTATION_LANDSCAPE,
                activity.getResources().getConfiguration().orientation);
        });
        documentOrigin = web.evaluate("performance.timeOrigin");
        openHistory("All");
        await("fresh available empty History", CARDS + ".length===0 && [...document.querySelectorAll('.history-text')].some(e=>e.textContent==='No history yet.')");
        observe("fresh-empty");
        captureScreenshot("fresh-empty");
    }

    @After
    public void closeOwnedActivityAndPreserveBoundedWitness() throws Exception {
        List<Throwable> failures = new ArrayList<>();
        boolean closed = scenario == null;
        try { if (web != null) observe(passed ? "completed" : "failed"); }
        catch (Throwable failure) { failures.add(failure); }
        try { if (scenario != null) scenario.close(); closed = true; }
        catch (Throwable failure) { failures.add(failure); }
        try {
            if (directory != null && directory.isDirectory()) {
                JSONObject result = new JSONObject().put("kind", "COMPACT_HISTORY_NATIVE_V1")
                    .put("nonce", nonce).put("profile", profile).put("passed", passed && failures.isEmpty())
                    .put("activityScenarioClosed", closed).put("nativeHost", true)
                    .put("remoteDeliveryClaimed", false).put("observations", observations)
                    .put("actionTargets", actionTargets).put("copies", copies)
                    .put("screenshots", screenshots);
                byte[] bytes = result.toString(2).getBytes(StandardCharsets.UTF_8);
                assertTrue("Bounded synthetic public witness", bytes.length <= 128 * 1024);
                try (FileOutputStream output = new FileOutputStream(new File(directory, "witness.json"))) { output.write(bytes); }
                android.util.Log.i("ClippCompact21", "nonce=" + nonce + ";profile=" + profile
                    + ";passed=" + result.getBoolean("passed") + ";activityScenarioClosed=" + closed
                    + ";witness=" + new File(directory, "witness.json").getAbsolutePath());
            }
        } catch (Throwable failure) { failures.add(failure); }
        MultipleFailureException.assertEmpty(failures);
    }

    @Test
    public void nativeCompactHistoryDetailsAndSelectedActions() throws Exception {
        String shared = repeat("a", 219) + "👩🏽‍💻";
        String firstText = shared + "\n" + nonce + " first 🇦🇪 e\u0301 👍🏽\n" + repeat("unbroken", 90) + "\nfirst ending";
        String secondText = shared + "\n" + nonce + " second 🇦🇪 e\u0301 👍🏽\nsecond ending";
        String firstId = ingress(firstText);
        await("one Clip finishes its public entry animation", card(firstId) + ".getAnimations().every(a=>a.playState!=='running')");
        observe("one-Clip-intrinsic-size");
        String secondId = ingress(secondText);
        boolean segmenter = "true".equals(web.evaluate("typeof Intl.Segmenter==='function'"));
        assertEquals("Complete boundary grapheme or exact full fallback", segmenter ? shared + "…" : firstText,
            web.evaluate(card(firstId) + ".querySelector('.history-text').textContent"));
        assertEquals("Identical previews preserve independent full targets", segmenter ? shared + "…" : secondText,
            web.evaluate(card(secondId) + ".querySelector('.history-text').textContent"));
        for (int i = 0; i < 10; i++) ingress(nonce + " dense-" + i + " " + repeat("text 🇦🇪 e\u0301 ", 24));
        assertEquals("Delete is absent from all rows", "0", web.evaluate("document.querySelectorAll('.history-card button[aria-label=\"Delete Clip\"]').length"));
        observe("dense-public-History");
        captureScreenshot("dense-history");

        actionTap(card(firstId) + ".querySelector('button[aria-label=\"Pin Clip\"]')");
        await("selected row pinned", card(firstId) + ".querySelector('[aria-label=\"Pin Clip\"]').getAttribute('aria-pressed')==='true'");
        assertEquals("Pin does not open details", "false", web.evaluate("!!(" + DIALOG + ")"));
        openHistory("Pinned");
        replaceQuery(nonce);
        await("query and Pinned identify the original selected Clip", CARDS + ".length===1 && " + CARDS + "[0].dataset.clipId===" + JSONObject.quote(firstId));
        actionTap(card(firstId) + ".querySelector('button[aria-label=\"View Clip details\"]')");
        awaitDetails(firstId, firstText);
        captureScreenshot("selected-details");
        copyAndConfirm(DIALOG + ".querySelector('button[aria-label=\"Copy Clip\"]')", firstText, "details-Copy");
        actionTap(DIALOG + ".querySelector('button[aria-label=\"Pin Clip\"]')");
        await("details unpins the same target without replacing content", DIALOG + ".querySelector('[aria-label=\"Pin Clip\"]').getAttribute('aria-pressed')==='false'");
        awaitDetails(firstId, firstText);
        actionTap(DIALOG + ".querySelector('button[aria-label=\"Pin Clip\"]')");
        await("details re-pins same target", DIALOG + ".querySelector('[aria-label=\"Pin Clip\"]').getAttribute('aria-pressed')==='true'");
        nativeBack();
        await("actual HostTaskInput closes details", "!(" + DIALOG + ")");
        assertQueryScope(nonce, "Pinned");
        observe("details-Back-retains-query-scope");

        actionTap(card(firstId) + ".querySelector('button[aria-label=\"View Clip details\"]')");
        awaitDetails(firstId, firstText);
        actionTap(DIALOG + ".querySelector('button[aria-label=\"Delete Clip\"]')");
        await("selected deletion has an explicit missing target", "!!(" + DIALOG + ") && " + DIALOG
            + ".textContent.includes('This Clip is no longer available.') && !" + DIALOG + ".querySelector('.clip-details-content')");
        assertEquals("Deleted target never becomes its identical-preview neighbor", "false", web.evaluate("!!(" + card(firstId) + ")"));
        tap(web.button("Open History"));
        await("details returns to History", "!(" + DIALOG + ")");
        assertQueryScope(nonce, "Pinned");
        observe("selected-Delete-retains-query-scope");

        openHistory("All");
        tap(web.button("Clear search"));
        await("query cleared by its real control", "(" + QUERY + ").value===''");
        String finalCopy = card(secondId) + ".querySelector('button[aria-label=\"Copy Clip\"]')";
        revealWithNativeSwipes(finalCopy);
        copyAndConfirm(finalCopy, secondText, "final-row-Copy-exact-neighbor");
        assertEquals("Row Copy never opens details", "false", web.evaluate("!!(" + DIALOG + ")"));
        actionTap(card(secondId) + ".querySelector('button[aria-label=\"View Clip details\"]')");
        awaitDetails(secondId, secondText);
        // The second target has the same preview but its own exact full value and actions.
        revealWithNativeSwipes(DIALOG + ".querySelector('button[aria-label=\"Delete Clip\"]')");
        assertTarget(DIALOG + ".querySelector('button[aria-label=\"Copy Clip\"]')");
        assertTarget(DIALOG + ".querySelector('button[aria-label=\"Pin Clip\"]')");
        assertTarget(DIALOG + ".querySelector('button[aria-label=\"Delete Clip\"]')");
        actionTap(web.button("Close details"));
        await("final Close is reachable", "!(" + DIALOG + ")");
        observe("final-actions-reachable");
        captureScreenshot("final-actions");
        passed = true;
    }

    private String ingress(String text) throws Exception {
        check();
        assertTrue("Bounded synthetic Intent only", text.length() <= 4096 && text.contains(nonce));
        JSONArray before = new JSONArray(web.evaluate(CARDS + ".map(e=>e.dataset.clipId)"));
        Intent intent = new Intent(target, ExplicitTextIngressActivity.class).setAction(Intent.ACTION_SEND)
            .setType("text/plain").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra(Intent.EXTRA_TEXT, text);
        target.startActivity(intent);
        awaitForeground();
        String additions = CARDS + ".filter(e=>!" + before + ".includes(e.dataset.clipId))";
        await("exported native Intent produces one public Clip", additions + ".length===1");
        String id = web.evaluate(additions + "[0].dataset.clipId");
        assertTrue("Public immutable Clip ID", id.matches("[A-Za-z0-9_-]{1,256}"));
        return id;
    }

    private void copyAndConfirm(String control, String expected, String stage) throws Exception {
        check();
        String sentinel = "compact21-" + nonce + "-clipboard-sentinel-" + (++copySequence);
        web.onActivity(activity -> {
            requireFocusedOwner(activity);
            activity.getSystemService(ClipboardManager.class)
                .setPrimaryClip(ClipData.newPlainText("Clipp compact21 synthetic acceptance", sentinel));
        });
        syntheticClipboardOwned = true;
        assertClipboard(sentinel);
        actionTap(control);
        await("truthful public Copy result", "[...document.querySelectorAll('[role=status]')].some(e=>e.getClientRects().length && "
            + "(e.textContent.includes('Copied to clipboard.') || e.textContent.includes('Copied to clipboard, but Clipp could not save or share a new Clip.')))"
            + " && ![...document.querySelectorAll('[role=status]')].some(e=>e.getClientRects().length && e.textContent.includes('The Copy result is unconfirmed'))");
        assertClipboard(expected);
        assertTrue("Bounded real Copy witnesses", copies.length() < 4);
        copies.put(new JSONObject().put("stage", stage).put("syntheticSentinelWrittenBeforeRead", true)
            .put("nativeClipboardExact", true).put("expectedSyntheticLength", expected.length())
            .put("publicFeedback", web.evaluate("[...document.querySelectorAll('[role=status]')].filter(e=>e.getClientRects().length)"
                + ".map(e=>e.textContent).filter(text=>text.includes('Copied to clipboard')).map(text=>text.slice(0,400)).slice(0,4)")));
        observe(stage);
    }

    private void assertClipboard(String expected) throws Exception {
        assertTrue("Never read an unknown clipboard baseline", syntheticClipboardOwned);
        long end = Math.min(deadline, SystemClock.uptimeMillis() + 10_000);
        AtomicReference<String> actual = new AtomicReference<>();
        do {
            check();
            web.onActivity(activity -> {
                requireFocusedOwner(activity);
                ClipData data = activity.getSystemService(ClipboardManager.class).getPrimaryClip();
                CharSequence value = data != null && data.getItemCount() == 1 ? data.getItemAt(0).getText() : null;
                actual.set(value == null ? null : value.toString());
            });
            if (expected.equals(actual.get())) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        assertEquals("Actual native clipboard must equal the exact known synthetic value", expected, actual.get());
    }

    private void awaitDetails(String id, String text) throws Exception {
        await("exact selected complete details", "!!(" + DIALOG + ") && " + DIALOG + ".querySelector('.clip-details-content')?.textContent==="
            + JSONObject.quote(text) + " && [..." + DIALOG + ".querySelectorAll('dd')].some(e=>e.textContent===" + JSONObject.quote(id) + ")");
    }

    private void openHistory(String scope) throws Exception {
        tap(web.button("History"));
        await("History selected", "document.querySelector('nav button[aria-current=page]')?.textContent.trim()==='History'");
        if (!"true".equals(web.evaluate("!!(" + web.button(scope) + ")"))) tap(web.button("Filters"));
        tap(web.button(scope));
        await("actual " + scope + " scope", "(" + web.button(scope) + ")?.getAttribute('aria-pressed')==='true'");
    }

    private void replaceQuery(String value) throws Exception {
        tap(QUERY);
        long now = SystemClock.uptimeMillis();
        for (int action : new int[]{KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP}) {
            KeyEvent key = new KeyEvent(now, SystemClock.uptimeMillis(), action, KeyEvent.KEYCODE_A, 0, KeyEvent.META_CTRL_ON);
            key.setSource(InputDevice.SOURCE_KEYBOARD); instrumentation.sendKeySync(key);
        }
        instrumentation.sendStringSync(value);
        await("real native Search text", "(" + QUERY + ").value===" + JSONObject.quote(value));
        AtomicBoolean ime = new AtomicBoolean();
        web.onActivity(activity -> { WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(activity.getBridge().getWebView());
            ime.set(insets != null && insets.isVisible(WindowInsetsCompat.Type.ime())); });
        if (ime.get()) nativeBack();
        long end = Math.min(deadline, SystemClock.uptimeMillis() + 10_000);
        do {
            web.onActivity(activity -> { WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(ownerWebView);
                ime.set(insets != null && insets.isVisible(WindowInsetsCompat.Type.ime())); });
            if (!ime.get()) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        throw new AssertionError("Actual IME did not dismiss before read-only details");
    }

    private void awaitForeground() throws Exception {
        long end = Math.min(deadline, SystemClock.uptimeMillis() + 10_000);
        AtomicBoolean ready = new AtomicBoolean();
        do {
            check();
            web.onActivity(activity -> ready.set(activity == owner && activity.getBridge().getWebView() == ownerWebView
                && activity.hasWindowFocus() && activity.getLifecycle().getCurrentState() == androidx.lifecycle.Lifecycle.State.RESUMED));
            if (ready.get()) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        throw new AssertionError("The isolated MainActivity did not regain its actual foreground window");
    }

    private void requireFocusedOwner(MainActivity activity) {
        assertTrue("Native input/clipboard retains the exact foreground owner", activity == owner
            && activity.getBridge().getWebView() == ownerWebView && activity.hasWindowFocus()
            && activity.getLifecycle().getCurrentState() == androidx.lifecycle.Lifecycle.State.RESUMED);
    }

    private void assertQueryScope(String query, String scope) throws Exception {
        assertEquals("History query survives details", query, web.evaluate("(" + QUERY + ").value"));
        assertEquals("History scope survives details", "true", web.evaluate("(" + web.button(scope) + ")?.getAttribute('aria-pressed')==='true'"));
    }

    private String card(String id) { return "document.querySelector('.history-card[data-clip-id=" + JSONObject.quote(id) + "]')"; }
    private void nativeBack() { check(); web.onActivity(this::requireFocusedOwner); instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); }
    private void tap(String control) throws Exception { check(); web.tap(control); }
    private void actionTap(String control) throws Exception { revealWithNativeSwipes(control); assertTarget(control); tap(control); }
    private void await(String label, String expression) throws Exception { check(); web.await(label, expression); check(); }
    private void check() { assertTrue("Bounded native History journey", SystemClock.uptimeMillis() < deadline); }

    private void revealWithNativeSwipes(String control) throws Exception {
        for (int attempt = 0; attempt < 64; attempt++) {
            check();
            JSONObject value = new JSONObject(web.evaluate("(()=>{const e=" + control + ";if(!e)return {};const r=e.getBoundingClientRect();"
                + "const h=document.querySelector('.android-host').getBoundingClientRect();"
                + "let f=(" + DIALOG + "||document.querySelector('.content-pane')).getBoundingClientRect();"
                + "let top=Math.max(0,h.top,f.top),bottom=Math.min(innerHeight,h.bottom,f.bottom);"
                + "if(bottom-top<96){f=document.querySelector('.app-shell').getBoundingClientRect();top=Math.max(0,h.top,f.top);bottom=Math.min(innerHeight,h.bottom,f.bottom);}"
                + "return {visible:r.top>=top&&r.bottom<=bottom,below:r.bottom>bottom,"
                + "x:Math.max(h.left+1,Math.min(h.right-1,f.left+f.width/2)),top,bottom,width:innerWidth};})()"));
            if (value.optBoolean("visible")) return;
            assertTrue("Physical scroll frame remains usable", value.has("top") && value.getDouble("bottom") - value.getDouble("top") > 60);
            float[] points = new float[3];
            web.onActivity(activity -> {
                int[] location = new int[2]; activity.getBridge().getWebView().getLocationOnScreen(location);
                try {
                    assertTrue("Native swipe retains the exact focused owner", activity == owner
                        && activity.getBridge().getWebView() == ownerWebView && activity.hasWindowFocus()
                        && activity.getLifecycle().getCurrentState() == androidx.lifecycle.Lifecycle.State.RESUMED);
                    double scale = activity.getBridge().getWebView().getWidth() / value.getDouble("width");
                    double span = value.getDouble("bottom") - value.getDouble("top");
                    points[0] = location[0] + (float)(value.getDouble("x") * scale);
                    points[1] = location[1] + (float)((value.getDouble("top") + span * .75) * scale);
                    points[2] = location[1] + (float)((value.getDouble("top") + span * .25) * scale);
                    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(ownerWebView);
                    assertTrue("Native swipe requires delivered safe bounds", insets != null);
                    Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                        | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
                    Rect window = activity.getWindowManager().getCurrentWindowMetrics().getBounds();
                    assertTrue("Swipe endpoints remain inside the actual native safe area",
                        points[0] > Math.max(location[0], window.left + safe.left)
                        && points[0] < Math.min(location[0] + ownerWebView.getWidth(), window.right - safe.right)
                        && Math.min(points[1], points[2]) > Math.max(location[1], window.top + safe.top)
                        && Math.max(points[1], points[2]) < Math.min(location[1] + ownerWebView.getHeight(), window.bottom - safe.bottom));
                } catch (Exception failure) { throw new AssertionError(failure); }
            });
            if (!value.getBoolean("below")) { float swap = points[1]; points[1] = points[2]; points[2] = swap; }
            UiAutomation automation = instrumentation.getUiAutomation();
            AccessibilityNodeInfo active = automation.getRootInActiveWindow();
            try { assertTrue("Native swipe requires the isolated app as active window", active != null
                && target.getPackageName().equals(String.valueOf(active.getPackageName()))); }
            finally { if (active != null) active.recycle(); }
            long down = SystemClock.uptimeMillis();
            boolean downSent = false, upSent = false;
            try {
                pointer(automation, MotionEvent.ACTION_DOWN, points[0], points[1], down); downSent = true;
                for (int step = 1; step <= 8; step++) { check(); SystemClock.sleep(20);
                    pointer(automation, MotionEvent.ACTION_MOVE, points[0], points[1] + (points[2] - points[1]) * step / 8, down); }
                pointer(automation, MotionEvent.ACTION_UP, points[0], points[2], down); upSent = true;
            } finally { if (downSent && !upSent) pointer(automation, MotionEvent.ACTION_CANCEL, points[0], points[2], down); }
            SystemClock.sleep(100);
        }
        throw new AssertionError("Final public control unreachable through bounded native scrolling");
    }

    private void pointer(UiAutomation automation, int action, float x, float y, long down) {
        if (action != MotionEvent.ACTION_CANCEL) check();
        web.onActivity(this::requireFocusedOwner);
        AccessibilityNodeInfo active = automation.getRootInActiveWindow();
        try { assertTrue("Gesture remains in the isolated native window", active != null
            && target.getPackageName().equals(String.valueOf(active.getPackageName()))); }
        finally { if (active != null) active.recycle(); }
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try { assertTrue("Native swipe input accepted", automation.injectInputEvent(event, true)); } finally { event.recycle(); }
    }

    private void assertTarget(String control) throws Exception {
        JSONObject css = new JSONObject(web.evaluate("(()=>{const e=" + control + ";if(!e)return {};const r=e.getBoundingClientRect();"
            + "return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight};})()"));
        assertTrue("Action remains in the real safe viewport", css.has("x") && css.getDouble("x") >= 0 && css.getDouble("y") >= 0
            && css.getDouble("x") + css.getDouble("width") <= css.getDouble("viewportWidth")
            && css.getDouble("y") + css.getDouble("height") <= css.getDouble("viewportHeight"));
        web.onActivity(activity -> {
            try {
                double pxPerCss = activity.getBridge().getWebView().getWidth() / css.getDouble("viewportWidth");
                float density = activity.getResources().getDisplayMetrics().density;
                requireFocusedOwner(activity);
                double widthDp = css.getDouble("width") * pxPerCss / density;
                double heightDp = css.getDouble("height") * pxPerCss / density;
                assertTrue("Action retains the strict 48dp native target", widthDp >= 48 && heightDp >= 48);
                int[] location = new int[2]; ownerWebView.getLocationOnScreen(location);
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(ownerWebView);
                assertTrue("Action requires actual delivered native safe bounds", insets != null);
                Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
                Rect window = activity.getWindowManager().getCurrentWindowMetrics().getBounds();
                double left = location[0] + css.getDouble("x") * pxPerCss;
                double top = location[1] + css.getDouble("y") * pxPerCss;
                double right = left + css.getDouble("width") * pxPerCss;
                double bottom = top + css.getDouble("height") * pxPerCss;
                assertTrue("Entire action stays inside actual native safe content", left >= Math.max(location[0], window.left + safe.left)
                    && top >= Math.max(location[1], window.top + safe.top)
                    && right <= Math.min(location[0] + ownerWebView.getWidth(), window.right - safe.right)
                    && bottom <= Math.min(location[1] + ownerWebView.getHeight(), window.bottom - safe.bottom));
                assertTrue("Bounded target rectangle evidence", actionTargets.length() < 32);
                actionTargets.put(new JSONObject().put("control", control).put("css", css)
                    .put("widthDp", widthDp).put("heightDp", heightDp)
                    .put("nativePx", new JSONObject().put("left", left).put("top", top).put("right", right).put("bottom", bottom)));

            } catch (Exception failure) { throw new AssertionError(failure); }
        });
    }

    private void observe(String stage) throws Exception {
        if (observations.length() >= 20) return;
        JSONObject value = new JSONObject(web.evaluate("(()=>{const rect=e=>e?e.getBoundingClientRect().toJSON():null;return {"
            + "stage:" + JSONObject.quote(stage) + ",documentTimeOrigin:performance.timeOrigin,viewport:{width:innerWidth,height:innerHeight},"
            + "query:(" + QUERY + ")?.value,scope:[...document.querySelectorAll('[aria-label=\"History filters\"] button[aria-pressed=true]')].map(e=>e.textContent.trim()),"
            + "cards:" + CARDS + ".slice(0,16).map(e=>({id:e.dataset.clipId,rect:rect(e)})),dialog:rect(" + DIALOG + "),"
            + "statuses:[...document.querySelectorAll('[role=status]')].filter(e=>e.getClientRects().length).map(e=>e.textContent.slice(0,600)).slice(0,8)};})()"));
        value.put("sameDocument", documentOrigin != null && documentOrigin.equals(web.evaluate("performance.timeOrigin")));
        web.onActivity(activity -> {
            try { value.put("fontScale", activity.getResources().getConfiguration().fontScale)
                .put("orientation", activity.getResources().getConfiguration().orientation)
                .put("textZoomPercent", activity.getBridge().getWebView().getSettings().getTextZoom()); }
            catch (Exception failure) { throw new AssertionError(failure); }
        });
        observations.put(value);
    }

    private void captureScreenshot(String stage) throws Exception {
        check();
        assertTrue("Fixed screenshot stage", stage.matches("[a-z-]{1,32}"));
        web.onActivity(this::requireFocusedOwner);
        // DOM assertions complete before Chromium necessarily composites the updated WebView surface.
        instrumentation.waitForIdleSync();
        SystemClock.sleep(350);
        instrumentation.waitForIdleSync();
        Bitmap image = instrumentation.getUiAutomation().takeScreenshot();
        assertTrue("Native screen capture available", image != null);
        File file = new File(directory, "screen-" + stage + ".png");
        try (FileOutputStream output = new FileOutputStream(file)) {
            assertTrue("Native screenshot encoded", image.compress(Bitmap.CompressFormat.PNG, 100, output));
        } finally {
            image.recycle();
        }
        long bytes = file.length();
        assertTrue("Bounded per-stage screenshot", bytes > 0 && bytes <= 3 * 1024 * 1024);
        assertTrue("Bounded screenshot count", screenshots.length() < 4);
        screenshots.put(new JSONObject().put("stage", stage).put("file", file.getName()).put("bytes", bytes));
    }

    private String readAsset(String name) throws Exception {
        try (InputStream input = target.getAssets().open(name)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) { output.write(buffer, 0, count); assertTrue("Bounded packaged metadata", output.size() <= 32 * 1024); }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
    private static String repeat(String text, int count) { StringBuilder output = new StringBuilder(); for (int i = 0; i < count; i++) output.append(text); return output.toString(); }
}
