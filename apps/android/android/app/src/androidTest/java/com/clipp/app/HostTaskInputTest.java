package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Instrumentation;
import android.content.Context;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
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
    private static final String DRAFT = "native back acceptance draft";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private ActivityScenario<MainActivity> scenario;
    private String lastTouchTarget = "none";
    private String lastTouchSample = "none";

    @Before
    public void requireIsolatedPackagedAppAndExplicitNativeInterval() throws Exception {
        Context target = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(target.getPackageName());
        Assume.assumeTrue("Root must opt in with -e hostTaskInputAcceptance true during its native interval",
            "true".equals(InstrumentationRegistry.getArguments().getString("hostTaskInputAcceptance")));
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

    private String button(String name) {
        return "[...document.querySelectorAll('button')].find(e => !e.disabled && !e.closest('[inert], [hidden]') && e.getClientRects().length && (e.getAttribute('aria-label') || e.textContent.trim()) === "
            + JSONObject.quote(name) + ")";
    }

    private void tapButton(String name) throws Exception {
        tap(button(name));
    }

    private void tap(String element) throws Exception {
        lastTouchTarget = element;
        await("native geometry and fonts ready", "document.documentElement.dataset.hostGeometry === 'android' && document.fonts.status === 'loaded'");
        await("touch target available", "!!(" + element + ")");
        // Scrolling only locates the public control; no click/focus/value is synthesized.
        evaluate("(() => { const e = " + element + "; e.scrollIntoView({block:'center', inline:'nearest'}); return true; })()");
        JSONObject bounds = stableTouchBounds(element);
        double cssX = bounds.getDouble("x"), cssY = bounds.getDouble("y");
        assertTrue("Target must be inside the visible web viewport", cssX > 0 && cssY > 0
            && cssX < bounds.getDouble("width") && cssY < bounds.getDouble("height"));
        float[] point = new float[2];
        scenario.onActivity(activity -> {
            WebView web = activity.getBridge().getWebView();
            int[] location = new int[2];
            web.getLocationOnScreen(location);
            float scale = (float) (web.getWidth() / bounds.optDouble("width"));
            point[0] = location[0] + (float) cssX * scale;
            point[1] = location[1] + (float) cssY * scale;
            assertTrue("Touch target must be inside the actual native WebView",
                point[1] > location[1] && point[1] < location[1] + web.getHeight());
        });
        long downTime = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, point[0], point[1], 0);
        MotionEvent up = MotionEvent.obtain(downTime, downTime + 40, MotionEvent.ACTION_UP, point[0], point[1], 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            instrumentation.sendPointerSync(down);
            instrumentation.sendPointerSync(up);
        } finally {
            down.recycle();
            up.recycle();
        }
        instrumentation.waitForIdleSync();
    }

    private JSONObject stableTouchBounds(String element) throws Exception {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        long stableSince = 0;
        String previous = null;
        do {
            // DOM existence precedes React's responsive/native-geometry effects.
            // Measure until settled, then dispatch exactly one physical tap below.
            String sample = evaluate("(() => { const e = " + element + "; if (!e) return {ready:false};"
                + " const r=e.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2, hit=document.elementFromPoint(x,y);"
                + " return {x,y,width:innerWidth,height:innerHeight,rect:{x:r.x,y:r.y,width:r.width,height:r.height},"
                + " shell:document.querySelector('.app-shell')?.className,"
                + " ready:!e.disabled && !e.closest('[inert], [hidden]') && r.width>0 && r.height>0 && x>0 && y>0 && x<innerWidth && y<innerHeight && !!hit && (hit===e || e.contains(hit))}; })()");
            lastTouchSample = sample;
            JSONObject bounds = new JSONObject(sample);
            long now = SystemClock.uptimeMillis();
            if (!bounds.optBoolean("ready") || !sample.equals(previous)) stableSince = now;
            else if (now - stableSince >= 250) return bounds;
            previous = sample;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Touch target did not settle: " + timeoutDiagnostics());
    }

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

    private String timeoutDiagnostics() throws Exception {
        // Failure-only public rendering evidence, bounded to the isolated synthetic app.
        // No stores, task internals, bridge state, ACKs or clipboard APIs are inspected.
        String ui = evaluate("(() => { const describe=e=>{if(!e)return null; const r=e.getBoundingClientRect();"
            + " return {tag:e.tagName,name:(e.getAttribute('aria-label')||e.textContent.trim()).slice(0,160),disabled:!!e.disabled,current:e.getAttribute('aria-current'),"
            + " inert:!!e.closest('[inert], [hidden]'),rect:{x:r.x,y:r.y,width:r.width,height:r.height}};};"
            + " return {body:document.body.innerText.slice(0,5000),active:describe(document.activeElement),"
            + " nav:[...document.querySelectorAll('nav button')].map(describe),"
            + " controls:[...document.querySelectorAll('button,input,textarea,[role=dialog]')].slice(0,40).map(describe),"
            + " viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},fonts:document.fonts.status,"
            + " hostGeometry:document.documentElement.dataset.hostGeometry,hostStyle:document.documentElement.getAttribute('style')}; })()");
        return "lastTouch=" + lastTouchTarget + ";lastSample=" + lastTouchSample + ";publicUI=" + ui;
    }

    private String evaluate(String expression) throws Exception {
        CountDownLatch complete = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
            expression, value -> { result.set(value); complete.countDown(); }));
        assertTrue("WebView evaluation timed out", complete.await(5, TimeUnit.SECONDS));
        assertNotNull("WebView returned no evaluation result", result.get());
        Object decoded = new JSONTokener(result.get()).nextValue();
        return String.valueOf(decoded);
    }

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
