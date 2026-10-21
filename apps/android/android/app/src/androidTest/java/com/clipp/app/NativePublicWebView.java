package com.clipp.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.runners.model.MultipleFailureException;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Public DOM location/witnessing plus physical Android input; never invokes a DOM action. */
final class NativePublicWebView {
    private static final long TIMEOUT_MS = 20_000;
    private static final String PUBLIC_ISSUES = "[...document.querySelectorAll('.recovery-issue')].slice(0,3).map(e=>({"
        + "messages:[...e.querySelectorAll('p')].slice(0,2).map(p=>p.innerText.slice(0,300)),"
        + "technical:[...e.querySelectorAll('pre')].slice(0,1).map(p=>p.textContent.slice(0,1200))}))";
    private final Instrumentation instrumentation;
    private final ActivityScenario<MainActivity> scenario;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Integer ownedTaskId;
    private static final long UI_TIMEOUT_MS = 5_000;
    private String lastTouchTarget = "none";
    private String lastTouchSample = "none";
    private long lastTouchSampleUptimeMs;
    private long lastTouchSampleEpochMs;
    private String lastNativeTouchBefore = "none";
    private String lastNativeTouchAfter = "none";
    private String lastNativeTouchSettled = "none";
    private String lastTouchDispatch = "none";

    NativePublicWebView(Instrumentation instrumentation, ActivityScenario<MainActivity> scenario) {
        NativeAcceptanceTarget.requireIsolated(instrumentation.getTargetContext().getPackageName());
        this.instrumentation = instrumentation;
        this.scenario = scenario;
    }

    String button(String name) {
        return "(() => { const root = document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]') || document;"
            + " return [...root.querySelectorAll('button')].find(e => !e.disabled && !e.closest('[inert], [hidden], [aria-hidden=\"true\"]') && e.getClientRects().length && (e.getAttribute('aria-label') || e.textContent.trim()) === "
            + JSONObject.quote(name) + "); })()";
    }

    void await(String description, String expression) throws Exception {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            if ("true".equals(evaluate(expression))) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Timed out: " + description + "; " + timeoutDiagnostics());
    }

    void tap(String element) throws Exception {
        NativeAcceptanceTarget.requireIsolated(instrumentation.getTargetContext().getPackageName());
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
        lastNativeTouchAfter = "pending";
        lastNativeTouchSettled = "pending";
        lastTouchDispatch = "not-sent";
        onActivity(activity -> {
            WebView web = activity.getBridge().getWebView();
            int[] location = new int[2];
            web.getLocationOnScreen(location);
            float scale = (float) (web.getWidth() / bounds.optDouble("width"));
            point[0] = location[0] + (float) cssX * scale;
            point[1] = location[1] + (float) cssY * scale;
            assertTrue("Touch target must be inside the actual native WebView",
                point[1] > location[1] && point[1] < location[1] + web.getHeight());
            assertTrue("Physical pointer requires the actual foreground app window",
                activity.hasWindowFocus() && activity.getLifecycle().getCurrentState() == androidx.lifecycle.Lifecycle.State.RESUMED);
            lastNativeTouchBefore = nativeTouchGeometry(activity, point);
        });
        android.view.accessibility.AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
        assertTrue("Physical pointer requires the isolated app as active native window", root != null
            && instrumentation.getTargetContext().getPackageName().equals(String.valueOf(root.getPackageName())));
        long downTime = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, point[0], point[1], 0);
        MotionEvent up = null;
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            long downSent = SystemClock.uptimeMillis();
            lastTouchDispatch = "down-sent;up-pending;downEventTime=" + downTime + ";downSent=" + downSent;
            // Instrumentation.sendPointerSync can return while this host drops
            // the gesture's UP. Use genuine OS input with explicit acceptance,
            // guarded above to the actual isolated foreground app window.
            boolean downAccepted = instrumentation.getUiAutomation().injectInputEvent(down, true);
            long downReturned = SystemClock.uptimeMillis();
            String downTiming = ";transport=UiAutomation;downEventTime=" + downTime + ";downSent=" + downSent + ";downReturned=" + downReturned
                + ";downAccepted=" + downAccepted;
            lastTouchDispatch = "down-complete;up-pending" + downTiming;
            assertTrue("Android must accept the one physical DOWN: " + lastTouchDispatch, downAccepted);
            // MotionEvent eventTime describes when that event actually occurred.
            // Hold one real short gesture, then create UP from current uptime;
            // precreating a future UP timestamp does not hold the physical input.
            long remainingHold = downTime + 40 - SystemClock.uptimeMillis();
            if (remainingHold > 0) SystemClock.sleep(remainingHold);
            long upTime = SystemClock.uptimeMillis();
            up = MotionEvent.obtain(downTime, upTime, MotionEvent.ACTION_UP, point[0], point[1], 0);
            up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            long upSent = SystemClock.uptimeMillis();
            lastTouchDispatch = "down-complete;up-sent" + downTiming + ";upEventTime=" + upTime + ";upSent=" + upSent;
            Log.i("ClippNativeInputStage", "tap.up.enter;uptimeMs=" + SystemClock.uptimeMillis());
            boolean upAccepted = instrumentation.getUiAutomation().injectInputEvent(up, true);
            Log.i("ClippNativeInputStage", "tap.up.exit;accepted=" + upAccepted + ";uptimeMs=" + SystemClock.uptimeMillis());
            lastTouchDispatch = "down-complete;up-complete" + downTiming + ";upEventTime=" + upTime
                + ";upSent=" + upSent + ";upReturned=" + SystemClock.uptimeMillis()
                + ";upAccepted=" + upAccepted;
            assertTrue("Android must accept the one physical UP: " + lastTouchDispatch, upAccepted);
        } finally {
            down.recycle();
            if (up != null) up.recycle();
            Log.i("ClippNativeInputStage", "tap.nativeAfter.enter;uptimeMs=" + SystemClock.uptimeMillis());
            onActivity(activity -> lastNativeTouchAfter = nativeTouchGeometry(activity, point));
            Log.i("ClippNativeInputStage", "tap.nativeAfter.exit;uptimeMs=" + SystemClock.uptimeMillis());
        }
        Log.i("ClippNativeInputStage", "tap.mainPost.enter;uptimeMs=" + SystemClock.uptimeMillis());
        onActivity(activity -> lastNativeTouchSettled = nativeTouchGeometry(activity, point));
        Log.i("ClippNativeInputStage", "tap.mainPost.exit;uptimeMs=" + SystemClock.uptimeMillis());
    }

    /** Failure diagnostics only: read actual native geometry without changing input. */
    private String nativeTouchGeometry(MainActivity activity, float[] point) {
        WebView web = activity.getBridge().getWebView();
        int[] location = new int[2];
        web.getLocationOnScreen(location);
        Rect visible = new Rect();
        web.getWindowVisibleDisplayFrame(visible);
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(web);
        return "uptimeMs=" + SystemClock.uptimeMillis() + ";pointPx=" + point[0] + "," + point[1]
            + ";webOriginPx=" + location[0] + "," + location[1] + ";webSizePx=" + web.getWidth() + "x" + web.getHeight()
            + ";windowPx=" + activity.getWindowManager().getCurrentWindowMetrics().getBounds().toShortString()
            + ";visibleFramePx=" + visible.toShortString() + ";density=" + activity.getResources().getDisplayMetrics().density
            + ";fontScale=" + activity.getResources().getConfiguration().fontScale + ";textZoomPercent=" + web.getSettings().getTextZoom()
            + ";focused=" + activity.hasWindowFocus() + ";lifecycle=" + activity.getLifecycle().getCurrentState()
            + ";imeVisible=" + (insets == null ? "unknown" : insets.isVisible(WindowInsetsCompat.Type.ime()))
            + ";imePx=" + (insets == null ? "unknown" : insets.getInsets(WindowInsetsCompat.Type.ime()))
            + ";barsPx=" + (insets == null ? "unknown" : insets.getInsets(WindowInsetsCompat.Type.systemBars()));
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
                + " ready:!e.disabled && !e.closest('[inert], [hidden], [aria-hidden=\"true\"]') && r.width>0 && r.height>0 && x>0 && y>0 && x<innerWidth && y<innerHeight && !!hit && (hit===e || e.contains(hit))}; })()");
            lastTouchSample = sample;
            lastTouchSampleUptimeMs = SystemClock.uptimeMillis();
            lastTouchSampleEpochMs = System.currentTimeMillis();
            JSONObject bounds = new JSONObject(sample);
            long now = SystemClock.uptimeMillis();
            if (!bounds.optBoolean("ready") || !sample.equals(previous)) stableSince = now;
            else if (now - stableSince >= 250) return bounds;
            previous = sample;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Touch target did not settle: " + timeoutDiagnostics());
    }

    /** Read-only physical-gesture evidence; excludes generic DOM/content diagnostics. */
    JSONObject touchTimelineDiagnostics() throws Exception {
        JSONObject sample = "none".equals(lastTouchSample) ? new JSONObject() : new JSONObject(lastTouchSample);
        return new JSONObject().put("sample", sample)
            .put("sampleNativeUptimeMs", lastTouchSampleUptimeMs).put("sampleNativeEpochMs", lastTouchSampleEpochMs)
            .put("dispatch", lastTouchDispatch).put("nativeBefore", lastNativeTouchBefore)
            .put("nativeAfter", lastNativeTouchAfter).put("nativeSettled", lastNativeTouchSettled)
            .put("readNativeUptimeMs", SystemClock.uptimeMillis()).put("readNativeEpochMs", System.currentTimeMillis());
    }

    String startupIssueDiagnostics() throws Exception {
        return evaluate("JSON.stringify({structuredClone:typeof globalThis.structuredClone,issues:" + PUBLIC_ISSUES + "})");
    }

    String timeoutDiagnostics() throws Exception {
        // Public rendering evidence for failures or an explicit root diagnostic,
        // bounded to the isolated synthetic app. Specific issue <pre> content is
        // public technical detail; body.textContent/inline scripts are never read.
        // No stores, task internals, bridge state, ACKs or clipboard APIs are inspected.
        String ui = evaluate("(() => { const describe=e=>{if(!e)return null; const r=e.getBoundingClientRect();"
            + " return {tag:e.tagName,name:(e.getAttribute('aria-label')||e.textContent.trim()).slice(0,160),disabled:!!e.disabled,current:e.getAttribute('aria-current'),"
            + " inert:!!e.closest('[inert], [hidden], [aria-hidden=\"true\"]'),rect:{x:r.x,y:r.y,width:r.width,height:r.height}};};"
            + " return {body:document.body.innerText.slice(0,5000),active:describe(document.activeElement),"
            + " capabilities:{randomUUID:typeof globalThis.crypto?.randomUUID,getRandomValues:typeof globalThis.crypto?.getRandomValues,"
            + " arrayAt:typeof Array.prototype.at,objectHasOwn:typeof Object.hasOwn,structuredClone:typeof globalThis.structuredClone,readyState:document.readyState,href:location.href,"
            + " scripts:[...document.scripts].slice(0,12).map(e=>e.src?new URL(e.src).pathname:'inline'),"
            + " resources:performance.getEntriesByType('resource').map(e=>new URL(e.name).pathname).filter(p=>/\\.(js|css)$/.test(p)).slice(0,20)},"
            + " issues:" + PUBLIC_ISSUES + ","
            + " nav:[...document.querySelectorAll('nav button')].map(describe),"
            + " controls:[...document.querySelectorAll('button,input,textarea,[role=dialog]')].slice(0,40).map(describe),"
            + " viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},fonts:document.fonts.status,"
            + " hostGeometry:document.documentElement.dataset.hostGeometry,hostStyle:document.documentElement.getAttribute('style')}; })()");
        return "lastTouch=" + lastTouchTarget + ";lastSample=" + lastTouchSample + ";dispatch=" + lastTouchDispatch
            + ";nativeBefore=" + lastNativeTouchBefore + ";nativeAfter=" + lastNativeTouchAfter
            + ";nativeSettled=" + lastNativeTouchSettled + ";publicUI=" + ui;
    }

    /** Dispatch a native/public observation without requiring a live video UI to become globally idle. */
    void onActivity(ActivityScenario.ActivityAction<MainActivity> action) {
        onActivity(action, SystemClock.uptimeMillis() + UI_TIMEOUT_MS);
    }

    private void onActivity(ActivityScenario.ActivityAction<MainActivity> action, long deadline) {
        assertTrue("Bounded native observations must be requested off the UI thread",
            Looper.myLooper() != Looper.getMainLooper());
        CountDownLatch complete = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        AtomicBoolean active = new AtomicBoolean(true);
        Runnable dispatch = () -> {
            if (!active.get()) return;
            try {
                assertTrue("Native UI dispatch deadline expired", SystemClock.uptimeMillis() < deadline);
                MainActivity activity = currentActivity();
                if (active.get()) action.perform(activity);
            } catch (Throwable error) {
                failure.set(error);
            } finally { complete.countDown(); }
        };
        Log.i("ClippNativeInputStage", "observation.uiPost.enter;uptimeMs=" + SystemClock.uptimeMillis());
        assertTrue("Main Looper rejected native observation", main.post(dispatch));
        boolean completed;
        try {
            completed = complete.await(Math.max(0, deadline - SystemClock.uptimeMillis()), TimeUnit.MILLISECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new AssertionError("Native UI observation interrupted", error);
        } finally {
            active.set(false);
            main.removeCallbacks(dispatch);
        }
        assertTrue("Native UI observation did not complete within its deadline", completed);
        rethrow(failure.get());
        Log.i("ClippNativeInputStage", "observation.uiPost.exit;uptimeMs=" + SystemClock.uptimeMillis());
    }

    /** Resolve afresh on the UI thread: Activity recreation replaces the owner and WebView. */
    private MainActivity currentActivity() {
        assertTrue("Resolve native lifecycle ownership only on the UI thread", Looper.myLooper() == Looper.getMainLooper());
        Set<MainActivity> owners = new HashSet<>();
        for (Stage stage : Stage.values()) {
            if (stage == Stage.DESTROYED || stage == Stage.PRE_ON_CREATE) continue;
            for (Activity candidate : ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(stage)) {
                if (candidate.getClass() == MainActivity.class
                    && instrumentation.getTargetContext().getPackageName().equals(candidate.getPackageName())
                    && !candidate.isDestroyed() && !candidate.isFinishing()) owners.add((MainActivity) candidate);
            }
        }
        assertTrue("Expected one live isolated MainActivity owner; found " + owners.size(), owners.size() == 1);
        MainActivity owner = owners.iterator().next();
        if (ownedTaskId == null) ownedTaskId = owner.getTaskId();
        assertTrue("Native observation must retain its actual task owner", ownedTaskId >= 0 && ownedTaskId == owner.getTaskId());
        assertNotNull("Actual Activity bridge required", owner.getBridge());
        assertNotNull("Actual Activity-owned WebView required", owner.getBridge().getWebView());
        return owner;
    }

    String evaluate(String expression) throws Exception { return evaluate(expression, false); }

    /** Read-only diagnostics may observe a visible permission-paused owner, never a stopped/hidden owner. */
    String evaluateVisible(String expression) throws Exception { return evaluate(expression, true); }

    private String evaluate(String expression, boolean requireVisibleStarted) throws Exception {
        long deadline = SystemClock.uptimeMillis() + UI_TIMEOUT_MS;
        CountDownLatch complete = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        AtomicBoolean active = new AtomicBoolean(true);
        try {
            onActivity(activity -> {
                WebView view = activity.getBridge().getWebView();
                if (requireVisibleStarted) {
                    android.view.View decor = activity.getWindow().getDecorView();
                    assertTrue("Read-only diagnostic requires the exact still-visible STARTED owner",
                        activity.getLifecycle().getCurrentState().isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)
                        && decor.getWindowVisibility() == android.view.View.VISIBLE && decor.isShown());
                }
                view.evaluateJavascript(expression, value -> {
                    if (!active.get()) return;
                    try {
                        assertTrue("Public WebView result belongs to an obsolete Activity", currentActivity() == activity
                            && activity.getBridge().getWebView() == view);
                        result.set(value);
                    } catch (Throwable error) { failure.set(error); }
                    finally { complete.countDown(); }
                });
            }, deadline);
            assertTrue("WebView evaluation timed out within shared UI/callback deadline",
                complete.await(Math.max(0, deadline - SystemClock.uptimeMillis()), TimeUnit.MILLISECONDS));
            rethrow(failure.get());
            assertNotNull("WebView returned no evaluation result", result.get());
            Object decoded = new JSONTokener(result.get()).nextValue();
            return String.valueOf(decoded);
        } finally { active.set(false); }
    }

    /** @After only: live camera release must already have been asserted by the test. */
    void closeActivity() throws Exception {
        List<Throwable> failures = new ArrayList<>();
        try { onActivity(MainActivity::finish); }
        catch (Throwable error) { failures.add(error); }
        try { closeScenarioBounded(scenario); }
        catch (Throwable error) { failures.add(error); }
        MultipleFailureException.assertEmpty(failures);
    }

    static void closeScenarioBounded(ActivityScenario<MainActivity> ownedScenario) throws Exception {
        CountDownLatch complete = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        // Retain this exact scenario only. A late worker never resolves/closes a new current app owner.
        Thread worker = new Thread(() -> {
            try { ownedScenario.close(); }
            catch (Throwable error) { failure.set(error); }
            finally { complete.countDown(); }
        }, "clipp-owned-scenario-cleanup");
        worker.setDaemon(true);
        worker.start();
        boolean completed = complete.await(UI_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        if (!completed) worker.interrupt();
        assertTrue("Owned ActivityScenario cleanup unfinished after bounded wait", completed);
        rethrow(failure.get());
    }

    private static void rethrow(Throwable error) {
        if (error == null) return;
        if (error instanceof Error) throw (Error) error;
        if (error instanceof RuntimeException) throw (RuntimeException) error;
        throw new AssertionError("Native observation failed", error);
    }
}
