package com.clipp.app;

import android.app.Activity;
import android.app.Application;
import android.app.Instrumentation;
import android.content.Context;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.ViewTreeObserver;
import androidx.lifecycle.Lifecycle;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/** Opt-in test-owned public observations. No product controller/media hooks or input. */
final class ScannerPublicWitness implements Application.ActivityLifecycleCallbacks {
    private static final String BUFFER = "globalThis.__clippScannerPublicWitness15";
    private static final int MAX_PNG_BYTES = 4 * 1024 * 1024;
    private final Instrumentation instrumentation;
    private final Application application;
    private final String nonce;
    private final String feed;
    private final File directory;
    private final List<JSONObject> nativeTrace = new ArrayList<>();
    private final Map<Activity, ViewTreeObserver.OnWindowFocusChangeListener> focusListeners = new IdentityHashMap<>();
    private final JSONObject anchors = new JSONObject();
    private Integer taskId;
    private int nativeDropped;
    private boolean installed;
    private boolean closed;

    ScannerPublicWitness(Instrumentation instrumentation, String nonce, String feed, String method) throws Exception {
        this.instrumentation = instrumentation;
        Context context = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(context.getPackageName());
        if (!nonce.matches("[A-Za-z0-9_-]{1,80}") || !method.matches("[A-Za-z0-9_]{1,100}"))
            throw new AssertionError("Exact root nonce and owning test method required");
        this.nonce = nonce;
        this.feed = feed;
        application = (Application) context.getApplicationContext();
        // Root may read only these declared test-owned files, never product preferences.
        directory = new File(context.getCacheDir(), "witness15-" + nonce + "-" + method);
        if (directory.exists() || !directory.mkdir()) throw new AssertionError("Fresh witness directory required: " + directory);
        emit("artifactDirectory=" + directory.getAbsolutePath());
        application.registerActivityLifecycleCallbacks(this);
    }

    void install(NativePublicWebView web) throws Exception {
        long before = SystemClock.uptimeMillis();
        String script;
        try (InputStream stream = instrumentation.getContext().getAssets().open("scanner-public-witness.js")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) != -1) {
                bytes.write(buffer, 0, count);
                if (bytes.size() > 32_768) throw new AssertionError("Bounded test observer source required");
            }
            script = bytes.toString(StandardCharsets.UTF_8.name());
        }
        JSONObject browser = new JSONObject(web.evaluate(script));
        anchors.put("installNativeUptimeBeforeMs", before);
        anchors.put("installNativeUptimeAfterMs", SystemClock.uptimeMillis());
        anchors.put("browser", browser);
        installed = true;
    }

    /** Called before existing camera/scenario cleanup, even when the original test fails. */
    void finish(NativePublicWebView web) throws Exception {
        JSONObject result = new JSONObject();
        List<Throwable> failures = new ArrayList<>();
        try {
            result.put("rootNonce", nonce).put("declaredSyntheticImageSha256", feed).put("anchors", anchors);
            result.put("nativeTrace", nativeSnapshot()).put("nativeDropped", nativeDropped);
            AtomicBoolean resumed = new AtomicBoolean();
            if (web != null) web.onActivity(activity -> resumed.set(activity.getLifecycle().getCurrentState() == Lifecycle.State.RESUMED));
            if (!installed || !resumed.get()) {
                result.put("publicDom", installed ? "unavailable-owner-not-resumed" : "observer-not-installed");
                result.put("frame", new JSONObject().put("status", "unavailable-no-resumed-observer"));
            } else {
                JSONObject dom = new JSONObject(web.evaluate("(() => { const w=" + BUFFER + "; if(!w) return {unavailable:'observer-lost'};"
                    + " const s=w.read(); const {base64,...frame}=s.frame; return {trace:s.trace,dropped:s.dropped,frame}; })()"));
                result.put("publicDom", dom);
                JSONObject frame = dom.optJSONObject("frame");
                if (frame != null) {
                    emit("frameStatus=" + frame.optString("status") + ";rootNonce=" + nonce);
                    if ("captured".equals(frame.optString("status"))) {
                        try { saveFrame(web, frame); }
                        catch (Throwable error) {
                            frame.put("exportStatus", "unavailable").put("exportError", error.getClass().getSimpleName());
                            throw error;
                        }
                    }
                }
                // Only test observer listeners are removed. No product/media state changes.
                web.evaluate(BUFFER + "?.stop(); true");
            }
        } catch (Throwable error) {
            failures.add(error);
            result.put("collectorFailure", error.getClass().getSimpleName());
            if (!result.has("publicDom")) result.put("publicDom", "unavailable-native-or-web-observation");
            if (!result.has("frame") && !(result.opt("publicDom") instanceof JSONObject))
                result.put("frame", new JSONObject().put("status", "unavailable-collector-failure"));
        } finally {
            try { closeNative(); } catch (Throwable error) { failures.add(error); }
            result.put("nativeTrace", nativeSnapshot()).put("nativeDropped", nativeDropped);
            byte[] bytes = result.toString().getBytes(StandardCharsets.UTF_8);
            try {
                File trace = new File(directory, "public-trace.json");
                writeNew(trace, bytes);
                emit("tracePath=" + trace.getAbsolutePath() + ";bytes=" + bytes.length + ";sha256=" + sha256(bytes));
            } catch (Throwable error) { failures.add(error); }
            // Instrumentation status survives a later runner grant-handshake exception.
            // Bounded chunks, no PNG/base64 in stdout or logcat.
            String json = result.toString();
            for (int offset = 0, chunk = 0; offset < json.length(); offset += 2000, chunk++)
                emit("traceChunk=" + chunk + ";" + json.substring(offset, Math.min(json.length(), offset + 2000)));
        }
        org.junit.runners.model.MultipleFailureException.assertEmpty(failures);
    }

    private void saveFrame(NativePublicWebView web, JSONObject frame) throws Exception {
        int width = frame.getInt("width"), height = frame.getInt("height"), size = frame.getInt("bytes");
        if (width < 1 || width > 1920 || height < 1 || height > 1080 || size < 1 || size > MAX_PNG_BYTES)
            throw new AssertionError("Unqualified intrinsic frame bounds");
        int length = 4 * ((size + 2) / 3);
        long deadline = SystemClock.uptimeMillis() + 15_000;
        StringBuilder encoded = new StringBuilder(length);
        for (int start = 0; start < length; start += 32768) {
            if (SystemClock.uptimeMillis() >= deadline) throw new AssertionError("Exact frame export exceeded 15-second budget");
            String chunk = web.evaluate(BUFFER + ".read().frame.base64.slice(" + start + "," + Math.min(length, start + 32768) + ")");
            if (chunk.length() != Math.min(32768, length - start)) throw new AssertionError("Incomplete exact frame chunk");
            encoded.append(chunk);
        }
        byte[] png = Base64.decode(encoded.toString(), Base64.NO_WRAP);
        if (png.length != size) throw new AssertionError("Exact PNG byte length changed");
        File output = new File(directory, "intrinsic-video-frame.png");
        writeNew(output, png);
        frame.put("path", output.getAbsolutePath()).put("sha256", sha256(png));
        emit("framePath=" + output.getAbsolutePath() + ";width=" + width + ";height=" + height
            + ";bytes=" + size + ";sha256=" + frame.getString("sha256") + ";rootNonce=" + nonce);
    }

    private boolean owns(Activity activity) {
        if (closed || activity.getClass() != MainActivity.class
            || !instrumentation.getTargetContext().getPackageName().equals(activity.getPackageName())) return false;
        if (taskId == null) taskId = activity.getTaskId();
        return taskId == activity.getTaskId();
    }

    private synchronized void record(Activity activity, String event) {
        if (!owns(activity)) return;
        try {
            View decor = activity.getWindow().getDecorView();
            Rect visible = new Rect();
            decor.getWindowVisibleDisplayFrame(visible);
            JSONObject entry = new JSONObject().put("event", event).put("uptimeMs", SystemClock.uptimeMillis())
                .put("elapsedRealtimeMs", SystemClock.elapsedRealtime()).put("epochMs", System.currentTimeMillis())
                .put("taskId", activity.getTaskId()).put("activityInstance", System.identityHashCode(activity))
                .put("windowFocused", activity.hasWindowFocus()).put("windowVisibility", decor.getWindowVisibility())
                .put("decorShown", decor.isShown()).put("visibleFrame", visible.toShortString())
                .put("lifecycle", ((MainActivity) activity).getLifecycle().getCurrentState().name());
            if (nativeTrace.size() == 256) { nativeTrace.remove(0); nativeDropped++; }
            nativeTrace.add(entry);
        } catch (Exception error) { Log.w("ClippScannerWitness15", "native-observation-unavailable", error); }
    }

    private synchronized JSONArray nativeSnapshot() { return new JSONArray(nativeTrace); }

    @Override public void onActivityCreated(Activity activity, Bundle saved) {
        if (!owns(activity)) return;
        ViewTreeObserver.OnWindowFocusChangeListener listener = focused -> record(activity, "window-focus-" + focused);
        focusListeners.put(activity, listener);
        activity.getWindow().getDecorView().getViewTreeObserver().addOnWindowFocusChangeListener(listener);
        record(activity, "created");
    }
    @Override public void onActivityStarted(Activity activity) { record(activity, "started"); }
    @Override public void onActivityResumed(Activity activity) { record(activity, "resumed"); }
    @Override public void onActivityPaused(Activity activity) { record(activity, "paused"); }
    @Override public void onActivityStopped(Activity activity) { record(activity, "stopped"); }
    @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) { record(activity, "save-instance-state"); }
    @Override public void onActivityDestroyed(Activity activity) {
        record(activity, "destroyed");
        ViewTreeObserver.OnWindowFocusChangeListener listener = focusListeners.remove(activity);
        if (listener != null && activity.getWindow().getDecorView().getViewTreeObserver().isAlive())
            activity.getWindow().getDecorView().getViewTreeObserver().removeOnWindowFocusChangeListener(listener);
    }

    private void closeNative() throws Exception {
        application.unregisterActivityLifecycleCallbacks(this);
        CountDownLatch done = new CountDownLatch(1);
        if (!new Handler(Looper.getMainLooper()).post(() -> {
            try {
                closed = true;
                for (Map.Entry<Activity, ViewTreeObserver.OnWindowFocusChangeListener> entry : focusListeners.entrySet()) {
                    ViewTreeObserver observer = entry.getKey().getWindow().getDecorView().getViewTreeObserver();
                    if (observer.isAlive()) observer.removeOnWindowFocusChangeListener(entry.getValue());
                }
                focusListeners.clear();
            } finally { done.countDown(); }
        })) throw new AssertionError("Native witness cleanup post rejected");
        if (!done.await(5, TimeUnit.SECONDS)) throw new AssertionError("Native witness cleanup unavailable");
    }

    private void emit(String value) {
        Bundle status = new Bundle();
        status.putString(Instrumentation.REPORT_KEY_STREAMRESULT, "SC15_WITNESS " + value + "\n");
        instrumentation.sendStatus(0, status);
        Log.i("ClippScannerWitness15", value);
    }
    private static void writeNew(File file, byte[] bytes) throws Exception {
        if (!file.createNewFile()) throw new AssertionError("Preserve existing witness artifact: " + file);
        try (FileOutputStream stream = new FileOutputStream(file)) { stream.write(bytes); }
    }
    private static String sha256(byte[] bytes) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) result.append(String.format("%02x", b & 0xff));
        return result.toString();
    }
}
