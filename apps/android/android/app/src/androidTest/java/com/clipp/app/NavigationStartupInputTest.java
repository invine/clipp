package com.clipp.app;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.content.Context;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.model.MultipleFailureException;

/** One original real Devices gesture, with passive bounded public startup evidence. */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class NavigationStartupInputTest {
    private static final String BUFFER = "globalThis.__clippNavigationStartupWitness19";
    private static final int MAX_BYTES = 128 * 1024;
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private ActivityScenario<MainActivity> scenario;
    private NativePublicWebView web;
    private File directory;
    private String nonce;
    private boolean installed;
    private final JSONObject anchors = new JSONObject();

    @Before
    public void requireRootAssignedEnlargedPackagedStartup() throws Exception {
        Bundle arguments = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Root must opt in to the owned navigation startup interval",
            "true".equals(arguments.getString("navigationStartupAcceptance")));
        Context context = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(context.getPackageName());
        nonce = arguments.getString("navigationStartupRootNonce", "");
        assertTrue("Exact root interval nonce required", nonce.matches("[A-Za-z0-9_-]{1,80}"));
        try (InputStream stream = context.getAssets().open("capacitor.config.json")) {
            JSONObject server = new JSONObject(read(stream, 32_768)).optJSONObject("server");
            assertTrue("Packaged production assets required; dev server forbidden", server == null || !server.has("url"));
        }
        try (InputStream stream = context.getAssets().open("public/index.html")) { assertNotEquals(-1, stream.read()); }
        directory = new File(context.getCacheDir(), "navigation19-startup-" + nonce);
        assertTrue("Preserve any prior witness; a fresh root nonce is required", !directory.exists() && directory.mkdir());
        emit("artifactDirectory=" + directory.getAbsolutePath());
        scenario = ActivityScenario.launch(MainActivity.class);
        web = new NativePublicWebView(instrumentation, scenario);
        // Match the original startup seam, not a stronger readiness criterion.
        web.await("packaged workspace ready", "document.querySelector('nav[aria-label=\"Clipp destinations\"]') !== null");
        assertEquals("https://localhost/", web.evaluate("location.origin + '/'"));
        web.onActivity(activity -> {
            assertEquals("Actual OS enlarged text required", 2.0f, activity.getResources().getConfiguration().fontScale, 0.001f);
            assertEquals("Original actual WebView nonlinear text zoom required", 175, activity.getBridge().getWebView().getSettings().getTextZoom());
            assertEquals("Original rotated short WebView width", 1107, activity.getBridge().getWebView().getWidth());
            assertEquals("Original rotated short WebView height", 892, activity.getBridge().getWebView().getHeight());
        });
        assertEquals("Original CSS viewport profile required", "422x340", web.evaluate("innerWidth+'x'+innerHeight"));
        String source;
        try (InputStream stream = instrumentation.getContext().getAssets().open("navigation-startup-witness.js")) {
            source = read(stream, 32_768);
        }
        anchors.put("installNativeUptimeBeforeMs", SystemClock.uptimeMillis()).put("installNativeEpochBeforeMs", System.currentTimeMillis());
        // If evaluation fails after installing, @After still attempts removal.
        installed = true;
        anchors.put("browser", new JSONObject(web.evaluateVisible(source)));
        anchors.put("installNativeUptimeAfterMs", SystemClock.uptimeMillis()).put("installNativeEpochAfterMs", System.currentTimeMillis());
    }

    @Test
    public void oneOriginalDevicesGestureSelectsDevicesDuringEnlargedStartup() throws Exception {
        web.tap(web.button("Devices"));
        web.await("Devices selected", "document.querySelector('nav button[aria-current=\"page\"]')?.textContent.trim() === 'Devices'");
        JSONObject witness = new JSONObject(web.evaluateVisible(BUFFER + ".read()"));
        assertFalse("A truncated timeline cannot qualify this diagnosis", witness.getBoolean("truncated"));
        assertFalse("An expired timeline cannot qualify this diagnosis", witness.getBoolean("expired"));
        assertFalse("A failed public collector cannot qualify this diagnosis", witness.getBoolean("collectorFailed"));
        double duration = witness.getDouble("durationMs");
        assertTrue("Actual observation lifetime must remain within 25 seconds", Double.isFinite(duration) && duration >= 0 && duration <= 25_000);
        assertEquals("A real destination transition must be witnessed", "selection-observed", witness.getString("reason"));
        JSONArray trace = witness.getJSONArray("trace");
        for (String event : new String[]{"pointerdown", "pointerup", "touchstart", "touchend", "click"}) {
            boolean found = false;
            for (int index = 0; index < trace.length(); index++) {
                JSONObject entry = trace.getJSONObject(index);
                if (event.equals(entry.optString("event")) && entry.optJSONObject("input") != null
                    && entry.getJSONObject("input").optBoolean("trusted")) found = true;
            }
            assertTrue("Real trusted " + event + " must appear in the public timeline", found);
        }
    }

    @After
    public void exportAndUninstallBeforeClosingOwnedActivity() throws Exception {
        List<Throwable> failures = new ArrayList<>();
        JSONObject result = new JSONObject().put("rootNonce", nonce == null ? JSONObject.NULL : nonce)
            .put("anchors", anchors).put("scope", "one-original-Devices-gesture-public-startup-only");
        if (installed && web != null) {
            try {
                String observed = web.evaluateVisible("(() => { const w=" + BUFFER + "; return w ? w.read() : {unavailable:'observer-missing'}; })()");
                assertTrue("Public timeline export byte cap", observed.getBytes(StandardCharsets.UTF_8).length <= 112 * 1024);
                result.put("publicTimeline", new JSONObject(observed));
                result.put("nativeGesture", web.touchTimelineDiagnostics());
            } catch (Throwable error) {
                failures.add(error);
                result.put("collectorFailure", error.getClass().getSimpleName());
            } finally {
                try {
                    String removed = web.evaluateVisible("(() => { const w=" + BUFFER + "; if (!w) return false; try { w.stop(); } finally { delete " + BUFFER + "; } return !Object.hasOwn(globalThis,'__clippNavigationStartupWitness19'); })()");
                    result.put("observerRemoved", "true".equals(removed));
                    assertEquals("Test observer removal must be confirmed", "true", removed);
                } catch (Throwable error) {
                    failures.add(error);
                    result.put("observerRemoved", false).put("cleanupFailure", error.getClass().getSimpleName());
                }
            }
        } else result.put("publicTimeline", "observer-not-installed");
        if (directory != null) {
            try {
                byte[] bytes = result.toString().getBytes(StandardCharsets.UTF_8);
                assertTrue("Complete exported timeline byte cap", bytes.length <= MAX_BYTES);
                File output = new File(directory, "public-timeline.json");
                assertTrue("Preserve previous witness artifacts", output.createNewFile());
                try (FileOutputStream stream = new FileOutputStream(output)) { stream.write(bytes); }
                emit("tracePath=" + output.getAbsolutePath() + ";bytes=" + bytes.length + ";sha256=" + sha256(bytes));
                String json = result.toString();
                for (int start = 0, chunk = 0; start < json.length(); start += 2000, chunk++)
                    emit("traceChunk=" + chunk + ";" + json.substring(start, Math.min(json.length(), start + 2000)));
            } catch (Throwable error) { failures.add(error); }
        }
        if (scenario != null) {
            try {
                if (web != null) web.closeActivity();
                else NativePublicWebView.closeScenarioBounded(scenario);
            } catch (Throwable error) { failures.add(error); }
        }
        MultipleFailureException.assertEmpty(failures);
    }

    private static String read(InputStream stream, int limit) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = stream.read(buffer)) != -1) {
            output.write(buffer, 0, count);
            assertTrue("Bounded packaged fixture source/config required", output.size() <= limit);
        }
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private static String sha256(byte[] bytes) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) result.append(String.format("%02x", value & 0xff));
        return result.toString();
    }

    private void emit(String value) {
        Bundle status = new Bundle();
        status.putString(Instrumentation.REPORT_KEY_STREAMRESULT, "NAV19_WITNESS " + value + "\n");
        instrumentation.sendStatus(0, status);
        Log.i("ClippNavigationWitness19", value);
    }
}
