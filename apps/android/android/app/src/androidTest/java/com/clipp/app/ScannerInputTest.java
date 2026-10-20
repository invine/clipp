package com.clipp.app;

import static org.junit.Assert.*;

import android.Manifest;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Rect;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Root-assigned real camera interval only. Never a host webcam/operator package.
 * The declared imagefile feed is virtual-camera evidence, not physical/OEM support.
 * Public DOM only locates/witnesses controls; actions are actual OS touch/Back.
 * CameraManager availability and read-only camera-service logs are captured while
 * MainActivity/WebView remain alive, before Activity close or root force-stop.
 */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class ScannerInputTest {
    private static final String TAG = "ClippScannerInput";
    private static final long TIMEOUT_MS = 20_000;
    private static final String VALID_IMAGE = "09e4dc07e4eae66a4eaad4db9a81cf0bf6a29477291058fd61f28f13e28c0288";
    private static final String BLANK_IMAGE = "27f5f8b9f7cbddef10dba9b20cf612832cccafea69b0f3b6bd28d15ba438a8bc";
    private static final String PAYLOAD_SHA = "1882e318603180f362ea61ec95e07c38d8e0896fa47f68fc6deb904d6ccb60ae";
    private static final String OVERLAY = "document.getElementById('clipp-android-qr-scanner')";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private ActivityScenario<MainActivity> scenario;
    private NativePublicWebView web;
    private WebView originalWebView;
    private Bundle arguments;
    private CameraWitness camera;
    private String nonce;

    @Before
    public void requireRootAssignedIsolatedPackagedCamera() throws Exception {
        Context context = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(context.getPackageName());
        arguments = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Root must explicitly opt in to scannerAcceptance", "true".equals(arguments.getString("scannerAcceptance")));
        nonce = arguments.getString("scannerRootNonce", "");
        assertTrue("Root interval nonce required", nonce.matches("[A-Za-z0-9_-]{1,80}"));
        String feed = arguments.getString("scannerCameraImageSha256", "");
        assertTrue("Root must bind the exact declared synthetic imagefile feed", VALID_IMAGE.equals(feed) || BLANK_IMAGE.equals(feed));
        JSONObject config;
        try (InputStream stream = context.getAssets().open("capacitor.config.json")) {
            config = new JSONObject(read(stream));
        }
        JSONObject server = config.optJSONObject("server");
        assertTrue("Packaged production assets required; dev server forbidden", server == null || !server.has("url"));
        try (InputStream stream = context.getAssets().open("public/index.html")) { assertNotEquals(-1, stream.read()); }
        AccessibilityServiceInfo info = instrumentation.getUiAutomation().getServiceInfo();
        info.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        instrumentation.getUiAutomation().setServiceInfo(info);
        camera = new CameraWitness(context);
        camera.awaitAllAvailable();
        scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(activity -> originalWebView = activity.getBridge().getWebView());
        web = new NativePublicWebView(instrumentation, scenario);
        web.await("packaged workspace ready", "document.querySelector('nav[aria-label=\"Clipp destinations\"]') !== null");
        assertEquals("https://localhost/", web.evaluate("location.origin + '/'"));
        Log.i(TAG, "declaredImageSha256=" + feed + ";rootNonce=" + nonce);
    }

    @After
    public void closeOnlyAfterLiveAssertions() {
        if (camera != null) camera.close();
        if (scenario != null) scenario.close();
    }

    @Test
    public void validPublicQrUsesExistingPairingSubmission() throws Exception {
        requireFeed(VALID_IMAGE);
        requireCameraGranted();
        openPairing();
        long before = camera.sequence();
        tap("Scan QR");
        camera.awaitAcquiredAfter(before);
        web.await("software scanner returns to Pairing", OVERLAY + " === null");
        camera.awaitAllAvailable();
        assertLiveAndLogCamera("valid-scan-release");
        awaitPublicAttempt();
        web.tap("document.querySelector('details.pairing-diagnostics > summary')");
        String diagnostics = web.evaluate("document.querySelector('details.pairing-diagnostics pre').textContent");
        JSONObject attempt = new JSONObject(diagnostics);
        assertTrue("Decoded payload reaches actual Android Pairing action", attempt.getInt("inputLength") > 0);
        assertFalse("Public signed target must pass existing payload validation", "invalid".equals(attempt.optString("error")));
        tap("Paste pairing text");
        web.await("public decoded Pairing text", "document.querySelector('textarea[aria-label=\"Pairing text\"]') !== null");
        String payload = web.evaluate("document.querySelector('textarea[aria-label=\"Pairing text\"]').value");
        assertEquals("Actual camera text must match declared public fixture", PAYLOAD_SHA, sha256(payload));
        assertEquals(payload.length(), attempt.getInt("inputLength"));
        Log.i(TAG, "validPublicQr=existing-Pairing-action;payloadSha256=" + sha256(payload)
            + ";status=" + attempt.getString("status") + ";remotePeerSuccessClaimed=false");
    }

    @Test
    public void blankCancelBackBackgroundAndRepeatedOpenReleaseCamera() throws Exception {
        requireFeed(BLANK_IMAGE);
        requireCameraGranted();
        openPairing();
        for (int repeat = 0; repeat < 2; repeat++) {
            openBlankCamera();
            assertScannerBounds();
            web.tap(OVERLAY + ".querySelector('button.text-button')");
            awaitReleased("cancel-" + repeat);
            awaitPairing();
        }
        openBlankCamera();
        nativeBack();
        awaitReleased("native-Back");
        awaitPairing();
        nativeBack();
        web.await("next native Back dismisses Pairing parent", "document.querySelector('[role=\"dialog\"]') === null");
        openPairing();
        openBlankCamera();
        openActualSettings();
        awaitReleased("actual-background");
        externalSettingsBack();
        awaitPairing();
        assertEquals("Resume must not reopen capture", "true", web.evaluate(OVERLAY + " === null"));
        camera.awaitAllAvailable();
        assertLiveAndLogCamera("returned-without-capture");
    }

    @Test
    public void deniedCameraReturnRechecksWithoutAutomaticCapture() throws Exception {
        requireFeed(BLANK_IMAGE);
        assertEquals("Root must initially revoke only this isolated package's CAMERA", PackageManager.PERMISSION_DENIED,
            ContextCompat.checkSelfPermission(instrumentation.getTargetContext(), Manifest.permission.CAMERA));
        // am instrument string arguments use Bundle strings, not numeric getters.
        String rawHold = arguments.getString("scannerPermissionRecoveryHoldMs", "");
        assertTrue("Root must bound recovery wait to 1..30000ms", rawHold.matches("[0-9]{1,5}"));
        long hold = Long.parseLong(rawHold);
        assertTrue(hold > 0 && hold <= 30_000);
        String prompt = arguments.getString("scannerPermissionPromptRequired", "");
        assertTrue("Root must explicitly distinguish prompt selection from already-denied profile", "true".equals(prompt) || "false".equals(prompt));
        openPairing();
        tap("Scan QR");
        boolean selectedDeny = tapPermissionDenyIfRequested();
        if ("true".equals(prompt)) assertTrue("Prompt profile requires a real system Don't allow selection", selectedDeny);
        web.await("typed denial with Paste recovery", "[...document.querySelectorAll('[role=\"alert\"]')].some(e => e.textContent.includes('Camera permission is required'))");
        assertEquals("Denial is not an active camera", "true", web.evaluate(OVERLAY + " === null"));
        assertEquals("Paste alternative remains reachable", "true", web.evaluate("!!(" + web.button("Paste pairing text") + ")"));
        camera.awaitAllAvailable();
        long before = camera.sequence();
        openActualSettings();
        Log.i(TAG, "READY_PERMISSION_GRANT " + nonce);
        long deadline = SystemClock.uptimeMillis() + hold;
        while (ContextCompat.checkSelfPermission(instrumentation.getTargetContext(), Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
            && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(50);
        requireCameraGranted();
        externalSettingsBack();
        web.await("passive permission return recheck", "[...document.querySelectorAll('[role=\"alert\"]')].some(e => e.textContent.includes('Camera permission is now allowed'))");
        assertEquals("Permission return does not open camera", before, camera.sequence());
        assertEquals("Deliberate Retry required", "true", web.evaluate(OVERLAY + " === null"));
        openBlankCamera();
        web.tap(OVERLAY + ".querySelector('button.text-button')");
        awaitReleased("permission-recovery-deliberate-retry");
    }

    private void requireFeed(String hash) { assertEquals("Case requires its exact declared root imagefile feed", hash, arguments.getString("scannerCameraImageSha256")); }
    private void requireCameraGranted() { assertEquals("Root must grant only the assigned isolated CAMERA permission", PackageManager.PERMISSION_GRANTED, ContextCompat.checkSelfPermission(instrumentation.getTargetContext(), Manifest.permission.CAMERA)); }
    private void tap(String name) throws Exception { web.tap(web.button(name)); }
    private void openPairing() throws Exception {
        tap("Devices");
        web.await("Devices selected", "document.querySelector('nav button[aria-current=\"page\"]')?.textContent.trim() === 'Devices'");
        tap("Pair this device");
        awaitPairing();
    }
    private void awaitPairing() throws Exception { web.await("Pairing parent retained", "[...document.querySelectorAll('[role=\"dialog\"]')].some(e => document.getElementById(e.getAttribute('aria-labelledby'))?.textContent.trim() === 'Pairing')"); }
    private void openBlankCamera() throws Exception {
        long before = camera.sequence();
        tap("Scan QR");
        web.await("actual camera acquired and playing", OVERLAY + "?.innerText.includes('Point the camera at the QR code') && " + OVERLAY + ".querySelector('video').readyState >= 2 && " + OVERLAY + ".querySelector('video').videoWidth > 0");
        camera.awaitAcquiredAfter(before);
        assertLiveAndLogCamera("camera-acquired");
    }
    private void awaitReleased(String stage) throws Exception {
        web.await("scanner settled after " + stage, OVERLAY + " === null");
        camera.awaitAllAvailable();
        assertLiveAndLogCamera(stage);
    }
    private void assertScannerBounds() throws Exception {
        logGeometry("scanner-bounds", true);
    }
    private void nativeBack() { instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); instrumentation.waitForIdleSync(); }
    private void openActualSettings() {
        scenario.onActivity(activity -> activity.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", instrumentation.getTargetContext().getPackageName(), null))));
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
            AtomicBoolean paused = new AtomicBoolean();
            scenario.onActivity(activity -> paused.set(!activity.hasWindowFocus() && activity.getLifecycle().getCurrentState() != Lifecycle.State.RESUMED));
            if (paused.get() && root != null && "com.android.settings".equals(String.valueOf(root.getPackageName()))) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        fail("Actual external Settings Activity must be foreground and app paused");
    }
    private void externalSettingsBack() {
        long down = SystemClock.uptimeMillis();
        for (int action : new int[] { KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP }) {
            KeyEvent event = new KeyEvent(down, SystemClock.uptimeMillis(), action, KeyEvent.KEYCODE_BACK, 0);
            event.setSource(InputDevice.SOURCE_KEYBOARD);
            assertTrue(instrumentation.getUiAutomation().injectInputEvent(event, true));
            SystemClock.sleep(40);
        }
    }
    private boolean tapPermissionDenyIfRequested() {
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        do {
            AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
            if (root != null) {
                String pkg = String.valueOf(root.getPackageName());
                if (pkg.endsWith("permissioncontroller")) {
                    for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByViewId(pkg + ":id/permission_deny_button")) {
                        if (!node.isVisibleToUser() || !node.isEnabled()) continue;
                        Rect bounds = new Rect(); node.getBoundsInScreen(bounds);
                        assertFalse("Native permission button needs real bounds", bounds.isEmpty());
                        long down = SystemClock.uptimeMillis();
                        for (int action : new int[] { MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP }) {
                            MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, bounds.exactCenterX(), bounds.exactCenterY(), 0);
                            event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
                            try { assertTrue(instrumentation.getUiAutomation().injectInputEvent(event, true)); }
                            finally { event.recycle(); }
                            SystemClock.sleep(40);
                        }
                        Log.i(TAG, "permissionDenial=actual-system-deny-control;actualSystemSelection=true");
                        return true;
                    }
                } else if (instrumentation.getTargetContext().getPackageName().equals(pkg)) {
                    // A previously denied WebView request may already have settled.
                    try { if ("true".equals(web.evaluate("[...document.querySelectorAll('[role=\"alert\"]')].some(e => e.textContent.includes('Camera permission is required'))"))) {
                        Log.i(TAG, "permissionDenial=already-denied-result;actualSystemSelection=false");
                        return false;
                    } }
                    catch (Exception error) { throw new AssertionError(error); }
                }
            }
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < deadline);
        fail("No actual permission denial control/result appeared");
        return false;
    }
    private void awaitPublicAttempt() throws Exception {
        long deadline = SystemClock.uptimeMillis() + 60_000;
        do {
            if ("true".equals(web.evaluate("!!document.querySelector('details.pairing-diagnostics pre')"))) return;
            SystemClock.sleep(100);
        } while (SystemClock.uptimeMillis() < deadline);
        fail("Decoded camera payload did not reach public existing Pairing diagnostics");
    }
    private void assertLiveAndLogCamera(String stage) throws Exception {
        scenario.onActivity(activity -> {
            assertFalse("Release witness must precede Activity destruction", activity.isDestroyed());
            assertFalse(activity.isFinishing());
            assertSame("Same production WebView must remain live", originalWebView, activity.getBridge().getWebView());
        });
        logGeometry(stage, false);
        try (ParcelFileDescriptor fd = instrumentation.getUiAutomation().executeShellCommand("dumpsys media.camera");
             InputStream stream = new ParcelFileDescriptor.AutoCloseInputStream(fd)) {
            StringBuilder selected = new StringBuilder();
            for (String line : read(stream).split("\\n")) {
                if (line.contains("Camera ID") || line.contains("CameraDeviceClient") || line.contains("Client(s)")
                    || line.contains("com.clipp.app.acceptance")) selected.append(line).append(";");
                if (selected.length() > 6000) break;
            }
            Log.i(TAG, "liveCameraService=" + stage + ";activityAlive=true;availability=" + camera.snapshot() + ";service=" + selected);
        }
    }
    private void logGeometry(String stage, boolean requireInside) throws Exception {
        JSONObject css = new JSONObject(web.evaluate("(() => { const o=" + OVERLAY + ";const r=e=>{if(!e)return null;const q=e.getBoundingClientRect();return {x:q.x,y:q.y,width:q.width,height:q.height};};return {viewport:{width:innerWidth,height:innerHeight},overlay:r(o),video:r(o?.querySelector('video')),frame:r(o?.firstElementChild?.lastElementChild),controls:o?[...o.querySelectorAll('button')].map(r):[]};})()"));
        List<JSONObject> bounded = new ArrayList<>();
        if (requireInside) {
            bounded.add(css.getJSONObject("frame"));
            JSONArray controls = css.getJSONArray("controls");
            assertEquals("Both scanner actions must be present", 2, controls.length());
            for (int i = 0; i < controls.length(); i++) bounded.add(controls.getJSONObject(i));
        }
        JSONObject viewport = css.getJSONObject("viewport");
        scenario.onActivity(activity -> {
            WebView view = activity.getBridge().getWebView();
            int[] webLocation = new int[2], decorLocation = new int[2];
            view.getLocationOnScreen(webLocation);
            android.view.View decor = activity.getWindow().getDecorView();
            decor.getLocationOnScreen(decorLocation);
            Rect visible = new Rect(); decor.getWindowVisibleDisplayFrame(visible);
            WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(view);
            assertNotNull("Native insets required for measured scanner bounds", windowInsets);
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            Rect safe = new Rect(decorLocation[0] + insets.left, decorLocation[1] + insets.top,
                decorLocation[0] + decor.getWidth() - insets.right, decorLocation[1] + decor.getHeight() - insets.bottom);
            boolean intersectsWeb = safe.intersect(new Rect(webLocation[0], webLocation[1], webLocation[0] + view.getWidth(), webLocation[1] + view.getHeight()));
            boolean intersectsVisible = !visible.isEmpty() && safe.intersect(visible);
            if (requireInside) {
                assertTrue("Scanner geometry needs visible native WebView bounds", intersectsWeb && intersectsVisible);
            }
            // Measured WebView pixels / actual CSS viewport, never inferred DPR.
            double pixelsPerCss = view.getWidth() / viewport.optDouble("width");
            Rect tolerant = new Rect(safe); tolerant.inset(-2, -2);
            for (JSONObject rect : bounded) {
                assertTrue("Scanner control/QR frame must have positive area", rect.optDouble("width") > 0 && rect.optDouble("height") > 0);
                Rect physical = new Rect((int)Math.floor(webLocation[0] + rect.optDouble("x") * pixelsPerCss),
                    (int)Math.floor(webLocation[1] + rect.optDouble("y") * pixelsPerCss),
                    (int)Math.ceil(webLocation[0] + (rect.optDouble("x") + rect.optDouble("width")) * pixelsPerCss),
                    (int)Math.ceil(webLocation[1] + (rect.optDouble("y") + rect.optDouble("height")) * pixelsPerCss));
                assertTrue("Scanner control/QR frame inside actual host content: " + physical + " vs " + safe, tolerant.contains(physical));
            }
            Log.i(TAG, "nativeGeometry=" + stage + ";fontScale=" + activity.getResources().getConfiguration().fontScale
                + ";density=" + activity.getResources().getDisplayMetrics().density + ";windowPx=" + decor.getWidth() + "x" + decor.getHeight()
                + ";webViewPx=" + view.getWidth() + "x" + view.getHeight() + ";visiblePx=" + visible + ";insets=" + insets + ";safeContentPx=" + safe);
        });
        Log.i(TAG, "publicCssGeometry=" + stage + ";rectangles=" + css);
    }
    private static String read(InputStream stream) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buffer = new byte[4096]; int count;
        while ((count = stream.read(buffer)) != -1 && bytes.size() < 65536) bytes.write(buffer, 0, count);
        return bytes.toString(StandardCharsets.UTF_8.name());
    }
    private static String sha256(String value) throws Exception {
        StringBuilder out = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))) out.append(String.format("%02x", b & 0xff));
        return out.toString();
    }
    private static final class CameraWitness {
        private final CameraManager manager;
        private final Set<String> back = new HashSet<>();
        private final Map<String, Boolean> available = new HashMap<>();
        private long acquired = 0;
        private final CameraManager.AvailabilityCallback callback = new CameraManager.AvailabilityCallback() {
            @Override public void onCameraAvailable(String id) { update(id, true); }
            @Override public void onCameraUnavailable(String id) { update(id, false); }
        };
        CameraWitness(Context context) throws Exception {
            manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
            for (String id : manager.getCameraIdList()) {
                Integer facing = manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING);
                if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) back.add(id);
            }
            assertFalse("Declared back imagefile camera must exist", back.isEmpty());
            manager.registerAvailabilityCallback(callback, new Handler(Looper.getMainLooper()));
        }
        private synchronized void update(String id, boolean value) {
            if (!back.contains(id)) return;
            available.put(id, value);
            if (!value) acquired++;
            Log.i(TAG, "cameraAvailability;id=" + id + ";available=" + value + ";acquisitionSequence=" + acquired);
        }
        synchronized long sequence() { return acquired; }
        synchronized String snapshot() { return available.toString() + ";acquisitions=" + acquired; }
        private synchronized boolean allAvailable() { return available.keySet().containsAll(back) && !available.containsValue(false); }
        void awaitAllAvailable() {
            long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
            while (!allAvailable() && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(50);
            assertTrue("Every acquired back camera must be released while Activity remains live: " + snapshot(), allAvailable());
        }
        void awaitAcquiredAfter(long before) {
            long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
            while (sequence() <= before && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(50);
            assertTrue("Actual camera service must observe acquisition, not only DOM setup", sequence() > before);
        }
        void close() { manager.unregisterAvailabilityCallback(callback); }
    }
}
