package com.clipp.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Instrumentation;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Public DOM location/witnessing plus physical Android input; never invokes a DOM action. */
final class NativePublicWebView {
    private static final long TIMEOUT_MS = 20_000;
    private final Instrumentation instrumentation;
    private final ActivityScenario<MainActivity> scenario;
    private String lastTouchTarget = "none";
    private String lastTouchSample = "none";

    NativePublicWebView(Instrumentation instrumentation, ActivityScenario<MainActivity> scenario) {
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
                + " ready:!e.disabled && !e.closest('[inert], [hidden], [aria-hidden=\"true\"]') && r.width>0 && r.height>0 && x>0 && y>0 && x<innerWidth && y<innerHeight && !!hit && (hit===e || e.contains(hit))}; })()");
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

    String timeoutDiagnostics() throws Exception {
        // Failure-only public rendering evidence, bounded to the isolated synthetic app.
        // No stores, task internals, bridge state, ACKs or clipboard APIs are inspected.
        String ui = evaluate("(() => { const describe=e=>{if(!e)return null; const r=e.getBoundingClientRect();"
            + " return {tag:e.tagName,name:(e.getAttribute('aria-label')||e.textContent.trim()).slice(0,160),disabled:!!e.disabled,current:e.getAttribute('aria-current'),"
            + " inert:!!e.closest('[inert], [hidden], [aria-hidden=\"true\"]'),rect:{x:r.x,y:r.y,width:r.width,height:r.height}};};"
            + " return {body:document.body.innerText.slice(0,5000),active:describe(document.activeElement),"
            + " capabilities:{randomUUID:typeof globalThis.crypto?.randomUUID,getRandomValues:typeof globalThis.crypto?.getRandomValues,"
            + " arrayAt:typeof Array.prototype.at,objectHasOwn:typeof Object.hasOwn,readyState:document.readyState,href:location.href,"
            + " scripts:[...document.scripts].slice(0,12).map(e=>e.src?new URL(e.src).pathname:'inline'),"
            + " resources:performance.getEntriesByType('resource').map(e=>new URL(e.name).pathname).filter(p=>/\\.(js|css)$/.test(p)).slice(0,20)},"
            + " nav:[...document.querySelectorAll('nav button')].map(describe),"
            + " controls:[...document.querySelectorAll('button,input,textarea,[role=dialog]')].slice(0,40).map(describe),"
            + " viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},fonts:document.fonts.status,"
            + " hostGeometry:document.documentElement.dataset.hostGeometry,hostStyle:document.documentElement.getAttribute('style')}; })()");
        return "lastTouch=" + lastTouchTarget + ";lastSample=" + lastTouchSample + ";publicUI=" + ui;
    }

    String evaluate(String expression) throws Exception {
        CountDownLatch complete = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
            expression, value -> { result.set(value); complete.countDown(); }));
        assertTrue("WebView evaluation timed out", complete.await(5, TimeUnit.SECONDS));
        assertNotNull("WebView returned no evaluation result", result.get());
        Object decoded = new JSONTokener(result.get()).nextValue();
        return String.valueOf(decoded);
    }

}
