package com.clipp.app;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Application;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Rect;
import android.graphics.Bitmap;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.WindowManager;
import android.view.Display;
import android.webkit.WebView;
import android.widget.TextView;
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
import java.io.OutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TestName;
import org.junit.runner.RunWith;
import org.junit.runners.model.MultipleFailureException;

/** Selected N4/N5/N7/N8 native consumers, never the whole navigation matrix.
 * Root alone supplies actual guest profiles/geometry/uiMode, normal APK provenance,
 * network isolation and process-stop/reopen. No configuration/OS/DOM mutation is
 * performed here. DOM expressions only observe public controls; the unchanged
 * NativePublicWebView locates/scrolls controls and sends guarded physical input.
 * QR image evidence is NOT decoding/scanning qualification. Theme reopen is a
 * separately invoked new document; it asserts no destroyed-document draft survival.
 */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class NavigationProfilesTest {
    private static final long JOURNEY_MS = 180_000;
    private static final long OBSERVATION_MS = 20_000;
    private static final int MAX_WITNESS_BYTES = 96 * 1024;
    private static final int MAX_CAPTURE_PIXELS = 8_388_608;
    private static final int MAX_PNG_BYTES = 4 * 1024 * 1024;
    private static final String QUERY = "document.querySelector('input[aria-label=\"Search history\"]')";
    private static final String NAME = "document.querySelector('input[aria-label=\"Device Name\"]')";
    private static final String PAIR = "document.querySelector('textarea[aria-label=\"Pairing text\"]')";
    private static final String APPEARANCE = "document.querySelector('select[aria-label=\"Appearance\"]')";
    private static final String DIALOG = "document.querySelector('[role=dialog][aria-modal=true]')";
    private static final String NAME_ERROR = "Device Name must contain 1–64 characters without control or line breaks. Edit and Save again.";
    private static final String PAIR_ERROR = "Invalid pairing payload. Edit the text and try again.";
    @Rule public final TestName testName = new TestName();
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final JSONArray trace = new JSONArray();
    private final AtomicReference<JSONObject> firstDraw = new AtomicReference<>();
    private final AtomicReference<String> firstDrawError = new AtomicReference<>();
    private ActivityScenario<MainActivity> scenario;
    private NativePublicWebView web;
    private Application application;
    private Application.ActivityLifecycleCallbacks drawObserver;
    private Context target;
    private MainActivity owner;
    private WebView ownerWebView;
    private File directory;
    private JSONObject contract;
    private JSONArray profiles;
    private String nonce, selectedCase, timeOrigin, query, pairingRaw;
    private long deadline;
    private boolean passed;
    private String generatedQrImage;
    private boolean captureEnabled, captureWorkerClosed;
    private int geometryCaptureIndex;
    private final JSONArray captures = new JSONArray();
    private final AtomicBoolean captureRetired = new AtomicBoolean();
    private ExecutorService captureWorker;
    private Future<CapturePixels> pendingCapture;

    @Before
    public void requireExplicitMeasuredNormalNativeAssignment() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Explicit root-owned profile interval required", "true".equals(args.getString("navigationProfilesAcceptance")));
        String capture = args.getString("navigationProfilesCapture", "false");
        assertTrue("Only the explicit bounded capture opt-in", capture.equals("true") || capture.equals("false"));
        captureEnabled = capture.equals("true");
        selectedCase = args.getString("navigationProfilesCase", "");
        String method = selectedCase.equals("qr-recovery") ? "generatedQrAndLocalRecoveriesRetainSession"
            : selectedCase.equals("geometry-ime") ? "assignedGeometryAndImeRetainTaskAndFinalControls"
            : selectedCase.equals("theme-live") ? "nativeSystemAndExplicitPalettesPreparePersistedReopen"
            : selectedCase.equals("theme-reopen") ? "persistedExplicitPaletteRestoresInNewOrdinaryDocument" : "";
        assertEquals("One explicitly assigned native method only", method, testName.getMethodName());
        nonce = args.getString("navigationProfilesRootNonce", "");
        assertTrue("Fresh bounded root nonce", nonce.matches("[A-Za-z0-9_-]{16,64}"));
        String raw = args.getString("navigationProfilesContract", "");
        assertTrue("Capped root profile JSON required", raw.getBytes(StandardCharsets.UTF_8).length <= 8192 && !raw.isEmpty());
        contract = new JSONObject(raw);
        assertEquals("Contract matches selected slice", selectedCase, contract.getString("case"));
        profiles = contract.getJSONArray("profiles");
        assertTrue("Selected pairwise profiles only", profiles.length() >= 1 && profiles.length() <= 4);
        for (int i = 0; i < profiles.length(); i++) validateProfile(profiles.getJSONObject(i));
        target = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(target.getPackageName());
        JSONObject server = new JSONObject(readAsset("capacitor.config.json")).optJSONObject("server");
        assertTrue("Ordinary packaged HTTPS only", server == null || (!server.has("url")
            && server.optString("hostname", "localhost").equals("localhost") && server.optString("androidScheme", "https").equals("https")));
        String index = readAsset("public/index.html");
        for (String forbidden : new String[]{"clipp-reset-owning-manifest", "clipp-reset-owning-progress", "__identityResetAcceptance"})
            assertFalse("Replacement entry refused", index.contains(forbidden));
        directory = new File(target.getCacheDir(), "navigation19-profiles-" + nonce);
        assertTrue("Preserve all previous evidence", !directory.exists() && directory.mkdir());
        if (captureEnabled) captureWorker = Executors.newSingleThreadExecutor(task -> {
            Thread thread = new Thread(task, "navigation19-owned-png");
            thread.setDaemon(true);
            return thread;
        });
        deadline = SystemClock.uptimeMillis() + JOURNEY_MS;
        query = "native19-" + nonce;
        pairingRaw = "invalid-native-pairing-" + nonce + "-" + new String(new char[1024]).replace('\0', 'x');
        installFirstDrawObserver();
        scenario = ActivityScenario.launch(MainActivity.class);
        web = new NativePublicWebView(instrumentation, scenario);
        awaitUi("normal ready workspace", "!!document.querySelector('nav[aria-label=\"Clipp destinations\"]') && document.documentElement.dataset.hostGeometry==='android' && document.fonts.status==='loaded'");
        assertEquals("Normal HTTPS origin", "https://localhost/", evaluate("location.origin+'/'"));
        captureOwner();
        awaitAssignedProfile(profiles.getJSONObject(0));
        awaitIme(false);
        observe("first-ready-document");
    }

    @Test
    public void generatedQrAndLocalRecoveriesRetainSession() throws Exception {
        setAppearance(contract.getString("appearance"));
        prepareQueryScope();
        openPairing(); tapButton("Show my QR"); awaitDialog("Pair this device");
        awaitUi("actual generated complete QR", "(()=>{const i=document.querySelector('img[alt=\"Pairing QR\"]');return !!i&&i.complete&&i.naturalWidth>0&&i.naturalWidth===i.naturalHeight})()");
        String image = "document.querySelector('img[alt=\"Pairing QR\"]')";
        // Public image bytes are retained for root's separately qualified decoder, never a scan verdict.
        generatedQrImage = evaluate("(" + image + ").currentSrc");
        assertTrue("Bounded actual public QR image only", generatedQrImage.startsWith("data:image/") && generatedQrImage.getBytes(StandardCharsets.UTF_8).length <= 32768);
        assertQrPresentation(image);
        JSONObject box = new JSONObject(evaluate("(" + image + ").getBoundingClientRect().toJSON()"));
        double ratio = physicalCssRatio();
        assertTrue("Rendered QR remains square within one physical raster pixel", Math.abs(box.getDouble("width") - box.getDouble("height")) * ratio <= 1);
        observe("generated-qr-public-pixels-undecoded");
        captureStage("generated-qr", image, true);
        tapButton("Copy pairing text");
        awaitUi("actual guest Copy confirmed", "[...document.querySelectorAll('[role=status]')].some(e=>e.textContent.trim()==='Pairing text copied. Paste it on your other device to start Pairing.')");
        assertReachable(web.button("Close QR dialog"), true);
        captureStage("qr-copy-final-close", web.button("Close QR dialog"), true);
        tapButton("Close QR dialog"); awaitDialog("Pairing");
        tapButton("Show my QR"); awaitDialog("Pair this device");
        nativeBack(); awaitDialog("Pairing"); assertFocusedButton("Show my QR");
        nativeBack(); awaitNoDialog(); assertFocusedButton("Pair this device"); assertQueryScope();
        createNameError(); captureStage("local-name-error", NAME, false); closeNameRetaining();
        openPairing(); tapButton("Paste pairing text"); awaitDialog("Paste pairing text");
        replaceText(PAIR, pairingRaw); hideIme();
        tapButton("Submit pairing text");
        awaitUi("real local Pairing rejection", "[...document.querySelectorAll('[role=status]')].some(e=>e.textContent.trim()===" + JSONObject.quote(PAIR_ERROR) + ")");
        awaitRawFocused(PAIR, pairingRaw); awaitIme(true); hideIme();
        assertReachable(web.button("Discard pairing input"), true);
        observe("invalid-paste-real-ime-retained-error");
        nativeBack(); awaitDialog("Pairing"); nativeBack(); awaitNoDialog();
        openIssues();
        assertTrue("Both genuine local recoveries stay discoverable", "true".equals(evaluate("!!(" + web.button("Open Device Name") + ")&&!!(" + web.button("Open Pairing") + ")")));
        assertReachable(web.button("Open Pairing"), true); observe("both-local-recoveries");
        tapButton("Open Device Name"); awaitDialog("Device Name"); awaitRawFocused(NAME, "   ");
        assertNameError(); if (nativeImeVisible()) hideIme();
        assertReachable(web.button("Cancel name edit"), true); tapButton("Cancel name edit"); awaitNoDialog();
        openIssues(); tapButton("Open Pairing"); awaitDialog("Pairing");
        tapButton("Paste pairing text"); awaitDialog("Paste pairing text"); awaitRawFocused(PAIR, pairingRaw);
        awaitUi("original Pairing rejection survives Issues recovery beside its field", DIALOG + "?.querySelector('[role=status]')?.textContent.trim()===" + JSONObject.quote(PAIR_ERROR) + "&&(" + PAIR + ")?.closest('[role=dialog]')===(" + DIALOG + ")&&(" + PAIR + ").value===" + JSONObject.quote(pairingRaw) + "&&document.activeElement===(" + PAIR + ")");
        if (nativeImeVisible()) hideIme();
        tapButton("Discard pairing input"); awaitDialog("Pairing"); nativeBack(); awaitNoDialog();
        assertQueryScope(); assertSameDocument(); observe("qr-recovery-final-controls"); completeJourney();
    }

    @Test
    public void assignedGeometryAndImeRetainTaskAndFinalControls() throws Exception {
        setAppearance(contract.getString("appearance")); prepareQueryScope(); createNameError();
        assertImeFieldAndFinalActions();
        for (int i = 1; i < profiles.length(); i++) {
            JSONObject expected = profiles.getJSONObject(i);
            externalCheckpoint("geometry-" + i, expected);
            awaitAssignedProfile(expected); assertSameDocument(); assertQueryScope(); assertNameError(); awaitRawFocused(NAME, "   ");
            observe("geometry-completed-" + i); assertImeFieldAndFinalActions();
        }
        if (nativeImeVisible()) hideIme();
        tapButton("Close name editor"); awaitNoDialog();
        tapButton("Rename this device"); awaitDialog("Device Name"); awaitRawFocused(NAME, "   "); assertNameError();
        if (nativeImeVisible()) hideIme();
        tapButton("Cancel name edit"); awaitNoDialog(); assertQueryScope(); assertSameDocument();
        observe("assigned-geometry-final-action"); completeJourney();
    }

    @Test
    public void nativeSystemAndExplicitPalettesPreparePersistedReopen() throws Exception {
        assertEquals("Minimal real Light-Dark-Light host sequence", 3, profiles.length());
        requireNight(profiles.getJSONObject(0), false);
        requireNight(profiles.getJSONObject(1), true);
        requireNight(profiles.getJSONObject(2), false);
        setAppearance("system"); prepareQueryScope(); createNameError(); assertPalette("system", false); observe("system-light-task");
        captureStage("system-light-task", NAME, false);
        externalCheckpoint("system-dark", profiles.getJSONObject(1));
        awaitAssignedProfile(profiles.getJSONObject(1));
        reestablishThemeTaskAfterPossibleRecreation(); assertPalette("system", true); observe("system-dark-task");
        captureStage("system-dark-task", NAME, false);
        closeNameRetaining(); setAppearance("light"); prepareQueryScope(); createNameError();
        assertPalette("light", true); observe("explicit-light-under-native-dark");
        captureStage("explicit-light-under-native-dark", NAME, false);
        closeNameRetaining(); setAppearance("dark"); prepareQueryScope(); createNameError(); assertPalette("dark", true);
        externalCheckpoint("system-light-explicit-dark", profiles.getJSONObject(2));
        awaitAssignedProfile(profiles.getJSONObject(2)); reestablishThemeTaskAfterPossibleRecreation();
        assertPalette("dark", false); assertImeFieldAndFinalActions(); observe("explicit-dark-under-native-light-retained-or-new-task");
        captureStage("explicit-dark-under-native-light", NAME, false);
        closeNameRetaining();
        // Root now independently stops the process and reopens with the SAME application data.
        // This test never destroys a document and then asserts its draft survived.
        completeJourney();
    }

    @Test
    public void persistedExplicitPaletteRestoresInNewOrdinaryDocument() throws Exception {
        assertEquals("One cold profile only", 1, profiles.length());
        assertEquals("Root must preserve the prior explicit choice and normal app data", "dark", contract.getString("persistedAppearance"));
        assertEquals("Applied persisted theme is already visible before any setting action", "dark", evaluate("document.documentElement.dataset.clippTheme"));
        assertPalette("dark", false); observe("persisted-dark-first-ready-new-document");
        captureStage("persisted-first-ready", "document.querySelector('.app-shell')", false);
        assertNull("Initial native observation must not hide an observer error", firstDrawError.get());
        assertNotNull("Initial native draw observation required", firstDraw.get());
        destination("settings"); awaitUi("authoritative persisted choice", "(" + APPEARANCE + ")?.value==='dark'&&!(" + APPEARANCE + ").disabled");
        prepareQueryScope(); createNameError(); assertPalette("dark", false); assertImeFieldAndFinalActions();
        captureStage("local-name-error", NAME, false);
        observe("reopened-dark-native-task-no-draft-continuity-claim"); closeNameRetaining(); completeJourney();
    }

    private void prepareQueryScope() throws Exception {
        destination("history"); replaceText(QUERY, query); hideIme();
        if ("false".equals(evaluate("(" + web.button("Filters") + ").getAttribute('aria-expanded')"))) tapButton("Filters");
        tapButton("Pinned"); assertQueryScope();
    }

    private void assertQueryScope() throws Exception {
        awaitUi("one retained live query and Pinned scope", "(" + QUERY + ")?.value===" + JSONObject.quote(query)
            + "&&[...document.querySelectorAll('[aria-label=\"History filters\"] button[aria-pressed=true]')].some(e=>e.textContent.trim()==='Pinned')");
    }

    private void destination(String name) throws Exception {
        tap("document.querySelector('nav[aria-label=\"Clipp destinations\"] [data-session-focus=\"destination:" + name + "\"]')");
        awaitUi("actual destination " + name, "document.querySelector('[data-session-focus=\"destination:" + name + "\"]')?.getAttribute('aria-current')==='page'");
    }

    private void openPairing() throws Exception { destination("devices"); tapButton("Pair this device"); awaitDialog("Pairing"); awaitIme(false); }
    private void openIssues() throws Exception { tap("document.querySelector('button.issue-summary')"); awaitDialog("Issues and recovery"); }
    private void createNameError() throws Exception {
        destination("devices"); tapButton("Rename this device"); awaitDialog("Device Name");
        replaceText(NAME, "   "); hideIme(); tapButton("Save Device Name");
        assertNameError(); awaitRawFocused(NAME, "   ");
    }
    private void assertNameError() throws Exception { awaitUi("genuine field-adjacent Name rejection", DIALOG + "?.querySelector('[role=alert]')?.textContent.trim()===" + JSONObject.quote(NAME_ERROR)); }
    private void closeNameRetaining() throws Exception { if (nativeImeVisible()) hideIme(); tapButton("Close name editor"); awaitNoDialog(); assertFocusedButton("Rename this device"); }

    private void assertImeFieldAndFinalActions() throws Exception {
        tap(NAME); awaitIme(true); assertReachable(NAME, false); assertTargets(); observe("actual-ime-open-field");
        if (selectedCase.equals("geometry-ime")) captureStage("geometry-ime-" + geometryCaptureIndex, NAME, false);
        nativeBack(); awaitIme(false); awaitDialog("Device Name"); awaitRawFocused(NAME, "   ");
        assertReachable(web.button("Save Device Name"), true); assertReachable(web.button("Cancel name edit"), true);
        if (selectedCase.equals("geometry-ime")) captureStage("geometry-controls-" + geometryCaptureIndex++, web.button("Cancel name edit"), false);
        focusWithNativeTab(NAME); awaitRawFocused(NAME, "   "); assertQueryScope();
    }

    private void setAppearance(String value) throws Exception {
        assertTrue("Only public three-mode Appearance", value.equals("system") || value.equals("light") || value.equals("dark"));
        destination("settings"); awaitUi("authoritative appearance ready", "!!(" + APPEARANCE + ")&&!(" + APPEARANCE + ").disabled&&!(" + APPEARANCE + ").hasAttribute('aria-busy')");
        tap(APPEARANCE);
        // Actual Android select dialog keyboard input, never select.value/change mutation.
        for (int i = 0; i < 3; i++) key(KeyEvent.KEYCODE_DPAD_UP);
        int down = value.equals("system") ? 0 : value.equals("light") ? 1 : 2;
        for (int i = 0; i < down; i++) key(KeyEvent.KEYCODE_DPAD_DOWN);
        key(KeyEvent.KEYCODE_ENTER);
        awaitUi("actual persisted Appearance selection", "(" + APPEARANCE + ")?.value===" + JSONObject.quote(value)
            + "&&!(" + APPEARANCE + ").hasAttribute('aria-busy')&&document.documentElement.dataset.clippTheme===" + JSONObject.quote(value));
        assertPalette(value, nativeGeometry().getBoolean("systemDark"));
    }

    private void assertPalette(String preference, boolean systemDark) throws Exception {
        final String expected = preference.equals("system") ? (systemDark ? "dark" : "light") : preference;
        awaitUi("actual applied/effective palette", "document.documentElement.dataset.clippTheme===" + JSONObject.quote(preference)
            + "&&matchMedia('(prefers-color-scheme: dark)').matches===" + systemDark
            + "&&getComputedStyle(document.documentElement).colorScheme===" + JSONObject.quote(expected));
        assertEquals("Actual native guest uiMode must agree with delivered System preference", systemDark, nativeGeometry().getBoolean("systemDark"));
    }

    private void reestablishThemeTaskAfterPossibleRecreation() throws Exception {
        boolean survived = sameDocument();
        trace.put(new JSONObject().put("stage", "theme-document-lifetime").put("survived", survived)
            .put("draftContinuity", survived ? "asserted-for-same-document" : "NOT_APPLICABLE_DESTROYED_DOCUMENT"));
        if (survived) { assertQueryScope(); assertNameError(); awaitRawFocused(NAME, "   "); }
        else {
            awaitUi("new normal document after actual host recreation", "!!document.querySelector('nav[aria-label=\"Clipp destinations\"]')&&document.documentElement.dataset.hostGeometry==='android'&&document.fonts.status==='loaded'");
            captureOwner(); prepareQueryScope(); createNameError();
        }
    }

    private void externalCheckpoint(String name, JSONObject expected) throws Exception {
        checkDeadline(); if (nativeImeVisible()) hideIme();
        observe("before-root-transition-" + name);
        checkDeadline(); emitDuringJourney("checkpoint=" + name + ";observationBudgetMs=" + Math.min(OBSERVATION_MS, deadline - SystemClock.uptimeMillis())
            + ";expected=" + expected.toString());
    }

    private void validateProfile(JSONObject profile) throws Exception {
        assertTrue("Bounded profile label", profile.getString("label").matches("[A-Za-z0-9_-]{1,64}"));
        for (String axis : new String[]{"Width", "Height"}) {
            String exact = "content" + axis;
            if (profile.has(exact)) assertTrue("Positive exact actual content target", profile.getDouble(exact) > 0 && profile.getDouble(exact) <= 4096);
            else assertTrue("Explicit finite actual bracket required", profile.getDouble(exact + "Min") > 0
                && profile.getDouble(exact + "Min") <= profile.getDouble(exact + "Max") && profile.getDouble(exact + "Max") <= 4096);
        }
        assertTrue("Actual independent native text setting", profile.getDouble("fontScale") > 0 && profile.getDouble("fontScale") <= 3);
        assertTrue("Measured WebView effect, not requested font percent", profile.getInt("textZoomPercent") >= 50 && profile.getInt("textZoomPercent") <= 300);
        profile.getBoolean("multiWindow");
        assertTrue("Explicit cutout measurement disposition", profile.getString("cutout").matches("nonzero|zero|observe"));
    }

    private void requireNight(JSONObject profile, boolean dark) throws Exception { assertEquals("Assigned actual guest uiMode", dark, profile.getBoolean("systemDark")); }
    private boolean dimension(JSONObject sample, JSONObject expected, String axis) throws Exception {
        double actual = sample.getDouble("content" + axis); String key = "content" + axis;
        // Point targets remain exact; explicit brackets are reported as brackets, never rounded into320/340/1100.
        return expected.has(key) ? Double.compare(actual, expected.getDouble(key)) == 0
            : actual >= expected.getDouble(key + "Min") && actual <= expected.getDouble(key + "Max");
    }
    private void awaitAssignedProfile(JSONObject expected) throws Exception {
        long end = Math.min(deadline, SystemClock.uptimeMillis() + OBSERVATION_MS); JSONObject actual = null;
        do {
            checkObservation(end);
            boolean cssReady = "true".equals(evaluate("document.documentElement.dataset.hostGeometry==='android'&&document.fonts.status==='loaded'&&['--clipp-content-width','--clipp-content-height'].every(k=>Number.isFinite(parseFloat(getComputedStyle(document.documentElement).getPropertyValue(k))))"));
            checkObservation(end);
            if (!cssReady) { SystemClock.sleep(50); continue; }
            actual = nativeGeometry(); checkObservation(end);
            JSONObject css = cssGeometry(); checkObservation(end);
            double cutout = 0; for (String edge : new String[]{"left", "top", "right", "bottom"}) cutout += actual.getJSONObject("cutoutPx").getInt(edge);
            if (dimension(css, expected, "Width") && dimension(css, expected, "Height")
                && Math.abs(actual.getDouble("fontScale") - expected.getDouble("fontScale")) <= 0.001
                && actual.getInt("textZoomPercent") == expected.getInt("textZoomPercent")
                && actual.getBoolean("multiWindow") == expected.getBoolean("multiWindow")
                && (!expected.has("systemDark") || actual.getBoolean("systemDark") == expected.getBoolean("systemDark"))
                && (expected.getString("cutout").equals("observe") || (cutout > 0) == expected.getString("cutout").equals("nonzero"))) {
                assertNativeContentBounds(actual, css); checkObservation(end); return;
            }
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        throw new AssertionError("Assigned actual profile unmet/UNKNOWN; expected=" + expected + ";native=" + actual + ";css=not remeasured after deadline");
    }

    private void assertQrPresentation(String image) throws Exception {
        // The existing guarded pointer helper locates the public image. The normal image
        // has no product action; actual DOWN/UP is observation setup, never decoding.
        tap(image);
        JSONObject measured = new JSONObject(evaluate("(()=>{const e=" + image + ",d=e.closest('[role=dialog]'),r=e.getBoundingClientRect(),s=getComputedStyle(document.documentElement);return {left:r.left,right:r.right,height:r.height,contentLeft:parseFloat(s.getPropertyValue('--clipp-content-left')),contentWidth:parseFloat(s.getPropertyValue('--clipp-content-width')),contentHeight:parseFloat(s.getPropertyValue('--clipp-content-height')),ownerOverflow:getComputedStyle(d).overflowY,ownerClientHeight:d.clientHeight,ownerScrollHeight:d.scrollHeight}})()"));
        assertTrue("Complete QR width stays inside actual available content", measured.getDouble("left") >= measured.getDouble("contentLeft")
            && measured.getDouble("right") <= measured.getDouble("contentLeft") + measured.getDouble("contentWidth"));
        if (measured.getDouble("height") <= measured.getDouble("contentHeight")) assertReachable(image, false);
        else assertTrue("Oversize QR has one explicit task scroll owner, not hidden cropping",
            measured.getString("ownerOverflow").matches("auto|scroll") && measured.getInt("ownerClientHeight") > 0
                && measured.getInt("ownerScrollHeight") > measured.getInt("ownerClientHeight"));
        assertEquals("QR never requires horizontal page hunting", "true", evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth&&document.body.scrollWidth<=innerWidth"));
    }

    private void assertReachable(String element, boolean mayScroll) throws Exception {
        if (mayScroll) focusWithNativeTab(element);
        long end = Math.min(deadline, SystemClock.uptimeMillis() + OBSERVATION_MS);
        awaitUiUntil(end, "public control inside actual usable content bounds", "(()=>{const e=" + element + ";if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(document.documentElement),l=parseFloat(s.getPropertyValue('--clipp-content-left')),t=parseFloat(s.getPropertyValue('--clipp-content-top')),w=parseFloat(s.getPropertyValue('--clipp-content-width')),h=parseFloat(s.getPropertyValue('--clipp-content-height'));return r.width>0&&r.height>0&&r.left>=l&&r.top>=t&&r.right<=l+w&&r.bottom<=t+h})()");
        assertNativeReachable(element, end);
        assertEquals("No horizontal page hunting", "true", evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth&&document.body.scrollWidth<=innerWidth"));
        checkObservation(end);
    }

    /** Independent physical oracle: window inset union, intersected with the actual
     * WebView in screen coordinates. An already resized WebView is intersected,
     * never reduced by IME a second time. No product geometry/plugin value is read. */
    private JSONObject nativeUsableScreen(JSONObject measured) throws Exception {
        JSONObject window = measured.getJSONObject("windowPx"), view = measured.getJSONObject("webViewPx");
        JSONObject bars = measured.getJSONObject("systemBarsPx"), cutout = measured.getJSONObject("cutoutPx"), ime = measured.getJSONObject("imePx");
        int left = Math.max(view.getInt("left"), window.getInt("left") + Math.max(bars.getInt("left"), Math.max(cutout.getInt("left"), ime.getInt("left"))));
        int top = Math.max(view.getInt("top"), window.getInt("top") + Math.max(bars.getInt("top"), Math.max(cutout.getInt("top"), ime.getInt("top"))));
        int right = Math.min(view.getInt("left") + view.getInt("width"), window.getInt("left") + window.getInt("width") - Math.max(bars.getInt("right"), Math.max(cutout.getInt("right"), ime.getInt("right"))));
        int bottom = Math.min(view.getInt("top") + view.getInt("height"), window.getInt("top") + window.getInt("height") - Math.max(bars.getInt("bottom"), Math.max(cutout.getInt("bottom"), ime.getInt("bottom"))));
        assertTrue("Native window/WebView/insets leave a nonempty usable intersection", right > left && bottom > top);
        return rect(left, top, right - left, bottom - top);
    }

    private JSONObject assertNativeContentBounds(JSONObject nativeState, JSONObject css) throws Exception {
        JSONObject usable = nativeUsableScreen(nativeState), view = nativeState.getJSONObject("webViewPx");
        double ratio = view.getDouble("width") / css.getDouble("viewportWidth");
        assertTrue("Measured physical/CSS ratio is finite and positive", Double.isFinite(ratio) && ratio > 0);
        double left = view.getDouble("left") + css.getDouble("contentLeft") * ratio;
        double top = view.getDouble("top") + css.getDouble("contentTop") * ratio;
        // One physical pixel permits CSS serialization/raster quantization only.
        // Assigned320/340/350/1099/1100/1101 profile dimensions remain exact above.
        assertEquals("CSS usable origin X equals independent native intersection", usable.getDouble("left"), left, 1);
        assertEquals("CSS usable origin Y equals independent native intersection", usable.getDouble("top"), top, 1);
        assertEquals("CSS usable right has no shifted/double inset reservation", usable.getDouble("left") + usable.getDouble("width"), left + css.getDouble("contentWidth") * ratio, 1);
        assertEquals("CSS usable bottom has no second IME subtraction", usable.getDouble("top") + usable.getDouble("height"), top + css.getDouble("contentHeight") * ratio, 1);
        return usable;
    }

    private void assertNativeReachable(String element, long end) throws Exception {
        checkObservation(end); JSONObject nativeState = nativeGeometry(); checkObservation(end);
        JSONObject css = cssGeometry(); checkObservation(end);
        JSONObject box = new JSONObject(evaluate("(" + element + ").getBoundingClientRect().toJSON()")); checkObservation(end);
        JSONObject usable = assertNativeContentBounds(nativeState, css), view = nativeState.getJSONObject("webViewPx");
        double ratio = view.getDouble("width") / css.getDouble("viewportWidth");
        double left = view.getDouble("left") + box.getDouble("left") * ratio;
        double top = view.getDouble("top") + box.getDouble("top") * ratio;
        double right = view.getDouble("left") + box.getDouble("right") * ratio;
        double bottom = view.getDouble("top") + box.getDouble("bottom") * ratio;
        assertTrue("Public control has positive physical size inside independent native safe area; usable=" + usable + ";public=" + box,
            right > left && bottom > top && left >= usable.getDouble("left") - 1 && top >= usable.getDouble("top") - 1
                && right <= usable.getDouble("left") + usable.getDouble("width") + 1 && bottom <= usable.getDouble("top") + usable.getDouble("height") + 1);
        checkObservation(end);
    }

    private void focusWithNativeTab(String element) throws Exception {
        for (int i = 0; i < 24; i++) {
            checkDeadline();
            if ("true".equals(evaluate("document.activeElement===(" + element + ")"))) return;
            key(KeyEvent.KEYCODE_TAB);
        }
        throw new AssertionError("Actual native Tab could not reach the assigned public final control");
    }

    private void assertTargets() throws Exception {
        JSONArray controls = new JSONArray(evaluate("[...document.querySelectorAll('nav[aria-label=\"Clipp destinations\"] button,[role=dialog] button')].filter(e=>e.getClientRects().length).map(e=>({name:(e.getAttribute('aria-label')||e.textContent.trim()).slice(0,80),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))"));
        JSONObject nativeState = nativeGeometry(); double ratio = physicalCssRatio(), density = nativeState.getDouble("density");
        for (int i = 0; i < controls.length(); i++) {
            JSONObject c = controls.getJSONObject(i);
            assertTrue("Actual target retains48dp intent: " + c.getString("name"), c.getDouble("width") * ratio / density >= 48 && c.getDouble("height") * ratio / density >= 48);
        }
    }

    private JSONObject cssGeometry() throws Exception { return new JSONObject(evaluate("(()=>{const s=getComputedStyle(document.documentElement);return {contentLeft:parseFloat(s.getPropertyValue('--clipp-content-left')),contentTop:parseFloat(s.getPropertyValue('--clipp-content-top')),contentWidth:parseFloat(s.getPropertyValue('--clipp-content-width')),contentHeight:parseFloat(s.getPropertyValue('--clipp-content-height')),viewportWidth:document.documentElement.getBoundingClientRect().width,viewportHeight:innerHeight}})()")); }
    private double physicalCssRatio() throws Exception { return nativeGeometry().getJSONObject("webViewPx").getInt("width") / cssGeometry().getDouble("viewportWidth"); }
    private JSONObject nativeGeometry() throws Exception {
        checkDeadline(); AtomicReference<JSONObject> result = new AtomicReference<>();
        web.onActivity(activity -> {
            try {
                WebView view = activity.getBridge().getWebView(); int[] point = new int[2]; view.getLocationOnScreen(point);
                Rect window = activity.getWindowManager().getCurrentWindowMetrics().getBounds();
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(view); assertNotNull("Actual native insets", insets);
                TextView body = new TextView(activity), unscaled = new TextView(activity);
                body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16); unscaled.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 16);
                int zoom = view.getSettings().getTextZoom();
                assertEquals("Independent native16sp oracle versus actual WebView preference", body.getTextSize(), unscaled.getTextSize() * zoom / 100f, unscaled.getTextSize() / 100f);
                result.set(new JSONObject().put("windowPx", rect(window.left, window.top, window.width(), window.height()))
                    .put("webViewPx", rect(point[0], point[1], view.getWidth(), view.getHeight()))
                    .put("systemBarsPx", inset(insets.getInsets(WindowInsetsCompat.Type.systemBars())))
                    .put("cutoutPx", inset(insets.getInsets(WindowInsetsCompat.Type.displayCutout())))
                    .put("imePx", inset(insets.getInsets(WindowInsetsCompat.Type.ime())))
                    .put("imeVisible", insets.isVisible(WindowInsetsCompat.Type.ime())).put("multiWindow", activity.isInMultiWindowMode())
                    .put("systemDark", (activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES)
                    .put("density", activity.getResources().getDisplayMetrics().density).put("fontScale", activity.getResources().getConfiguration().fontScale)
                    .put("textZoomPercent", zoom).put("nativeBody16spPx", body.getTextSize()).put("nativeBody16dpPx", unscaled.getTextSize())
                    .put("decorBackground", drawable(activity.getWindow().getDecorView().getBackground())).put("webViewBackground", drawable(view.getBackground()))
                    .put("focused", activity.hasWindowFocus()).put("taskId", activity.getTaskId()));
            } catch (Exception error) { throw new AssertionError("Native geometry observation failed", error); }
        });
        checkDeadline(); return result.get();
    }

    private void observe(String stage) throws Exception {
        long end = Math.min(deadline, SystemClock.uptimeMillis() + OBSERVATION_MS);
        checkObservation(end); assertTrue("Bounded selected-stage trace", trace.length() < 24);
        JSONObject state = new JSONObject(evaluate("(()=>{const d=" + DIALOG + ",a=document.activeElement;return {timeOrigin:performance.timeOrigin,appliedTheme:document.documentElement.dataset.clippTheme,systemDark:matchMedia('(prefers-color-scheme: dark)').matches,colorScheme:getComputedStyle(document.documentElement).colorScheme,rootBackground:getComputedStyle(document.documentElement).backgroundColor,bodyBackground:getComputedStyle(document.body).backgroundColor,dialog:d?{title:document.getElementById(d.getAttribute('aria-labelledby'))?.textContent,background:getComputedStyle(d).backgroundColor,rect:d.getBoundingClientRect().toJSON(),scrollHeight:d.scrollHeight,clientHeight:d.clientHeight,scrollTop:d.scrollTop}:null,query:(" + QUERY + ")?.value,scope:[...document.querySelectorAll('[aria-label=\"History filters\"] button[aria-pressed=true]')].map(e=>e.textContent.trim()),focus:a?{label:a.getAttribute('aria-label'),key:a.getAttribute('data-session-focus'),rect:a.getBoundingClientRect().toJSON(),color:getComputedStyle(a).color,background:getComputedStyle(a).backgroundColor,outline:getComputedStyle(a).outline}:null,messages:[...document.querySelectorAll('[role=alert],[role=status],.recovery-issue p')].filter(e=>e.getClientRects().length).slice(0,6).map(e=>({text:e.textContent.trim().slice(0,180),color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor})),qr:(()=>{const i=document.querySelector('img[alt=\"Pairing QR\"]');return i?{naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,rect:i.getBoundingClientRect().toJSON(),taskScroll:{overflow:getComputedStyle(d).overflowY,height:d.clientHeight,scrollHeight:d.scrollHeight,scrollTop:d.scrollTop}}:null})(),draftLength:(" + NAME + ")?.value.length??null}})()"));
        checkObservation(end); JSONObject nativeState = nativeGeometry(); checkObservation(end);
        JSONObject css = cssGeometry(); checkObservation(end);
        JSONObject usable = assertNativeContentBounds(nativeState, css); checkObservation(end);
        trace.put(new JSONObject().put("stage", stage).put("uptimeMs", SystemClock.uptimeMillis()).put("native", nativeState).put("css", css).put("independentUsableScreenPx", usable).put("public", state));
        checkObservation(end); emitDuringJourney("stage=" + stage); checkObservation(end);
    }

    private String[] requiredCaptureStages() {
        if (selectedCase.equals("qr-recovery")) return new String[]{"generated-qr", "qr-copy-final-close", "local-name-error"};
        if (selectedCase.equals("theme-live")) return new String[]{"system-light-task", "system-dark-task", "explicit-light-under-native-dark", "explicit-dark-under-native-light"};
        if (selectedCase.equals("theme-reopen")) return new String[]{"persisted-first-ready", "local-name-error"};
        String[] stages = new String[profiles.length() * 2];
        for (int i = 0; i < profiles.length(); i++) { stages[i * 2] = "geometry-ime-" + i; stages[i * 2 + 1] = "geometry-controls-" + i; }
        return stages;
    }

    /** Fixed callers only: this is neither a screenshot command surface nor an
     * earlier-frame observation. Capture adds no pointer, key, scroll or DOM write. */
    private void captureStage(String stage, String element, boolean qr) throws Exception {
        if (!captureEnabled) return;
        long end = Math.min(deadline, SystemClock.uptimeMillis() + OBSERVATION_MS);
        checkObservation(end);
        String[] expected = requiredCaptureStages();
        int sequence = captures.length();
        assertTrue("At most eight fixed required images", sequence < expected.length && sequence < 8);
        assertEquals("Capture order is fixed by the selected method", expected[sequence], stage);
        assertFalse("Retired capture worker cannot resume", captureRetired.get());
        File output = new File(directory, nonce + "-" + sequence + "-" + stage + ".png");
        assertEquals("Exclusive image remains in the nonce cache directory", directory.getCanonicalFile(), output.getCanonicalFile().getParentFile());
        JSONObject record = new JSONObject().put("stage", stage).put("sequence", sequence)
            .put("path", output.getCanonicalPath()).put("status", "PENDING")
            .put("observationDeadlineUptimeMs", end).put("earlierFramesObserved", false).put("decoderClaimed", false);
        captures.put(record);
        AtomicBoolean requestCurrent = new AtomicBoolean(true);
        try {
            JSONObject before = captureFrame(element, qr, end);
            record.put("before", before);
            pendingCapture = captureWorker.submit(() -> capturePixels(requestCurrent, end));
            long remaining = end - SystemClock.uptimeMillis();
            assertTrue("Capture must fit the existing observation deadline", remaining > 0);
            CapturePixels pixels = pendingCapture.get(remaining, TimeUnit.MILLISECONDS);
            checkObservation(end);
            JSONObject after = captureFrame(element, qr, end);
            record.put("after", after);
            assertEquals("Capture keeps the same owner, native geometry/uiMode and public target/scroll frame",
                before.getJSONObject("frame").toString(), after.getJSONObject("frame").toString());
            JSONObject window = before.getJSONObject("frame").getJSONObject("native").getJSONObject("windowPx");
            assertTrue("Owned default-display window fits the actual screenshot", window.getInt("left") >= 0 && window.getInt("top") >= 0
                && window.getInt("left") + window.getInt("width") <= pixels.width
                && window.getInt("top") + window.getInt("height") <= pixels.height);
            assertTrue("Capture acquisition belongs between the measured frames", pixels.started >= before.getLong("observedUptimeMs")
                && pixels.finished <= after.getLong("observedUptimeMs"));
            boolean targetComplete = captureTargetComplete(before.getJSONObject("frame"), pixels);
            record.put("targetCompleteInFrame", targetComplete);
            if (!stage.equals("generated-qr") && !stage.equals("persisted-first-ready"))
                assertTrue("Required field or final control must be wholly visible in its captured frame", targetComplete);
            if (qr) record.put("renderedQr", renderedQrCrop(before.getJSONObject("frame"), pixels));
            checkObservation(end);
            // The worker never receives a path or publishes files/metadata. Even
            // an uncancellable late screenshot can only recycle its bitmap.
            try (OutputStream stream = Files.newOutputStream(output.toPath(), StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                stream.write(pixels.png);
            }
            record.put("pngWrittenUptimeMs", SystemClock.uptimeMillis());
            checkObservation(end);
            assertEquals("Complete exclusive PNG bytes", pixels.png.length, output.length());
            record.put("widthPx", pixels.width).put("heightPx", pixels.height).put("bytes", pixels.png.length)
                .put("sha256", sha(pixels.png)).put("acquireStartedUptimeMs", pixels.started).put("acquireFinishedUptimeMs", pixels.finished)
                .put("meaning", "actual full owned guest display at this ready stage; no earlier frame or camera decode claim");
            checkObservation(end); record.put("status", "COMPLETE");
        } catch (Exception | Error failure) {
            captureRetired.set(true);
            record.put("status", "FAILED").put("errorClass", failure.getClass().getSimpleName());
            captureWorker.shutdownNow();
            throw failure;
        } finally {
            requestCurrent.set(false);
            if (pendingCapture != null) pendingCapture.cancel(true);
            pendingCapture = null;
        }
    }

    private JSONObject captureFrame(String element, boolean qr, long end) throws Exception {
        checkObservation(end); NativeAcceptanceTarget.requireIsolated(target.getPackageName()); assertSameDocument(); checkObservation(end);
        AtomicReference<JSONObject> ownerProof = new AtomicReference<>();
        web.onActivity(activity -> {
            assertTrue("Only the exact foreground owned Activity/WebView may be captured", activity == owner
                && activity.getBridge().getWebView() == ownerWebView && activity.hasWindowFocus() && !activity.isFinishing() && !activity.isDestroyed());
            assertNotNull("Actual capture display", activity.getDisplay());
            assertEquals("UiAutomation capture is the owned default display only", Display.DEFAULT_DISPLAY, activity.getDisplay().getDisplayId());
            assertEquals("Secure windows are not capture evidence", 0, activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE);
            try {
                ownerProof.set(new JSONObject().put("sameActivity", activity == owner).put("sameWebView", activity.getBridge().getWebView() == ownerWebView)
                    .put("displayId", activity.getDisplay().getDisplayId()).put("secureWindow", false));
            } catch (Exception error) { throw new AssertionError("Capture owner evidence unavailable", error); }
        });
        checkObservation(end); JSONObject nativeState = nativeGeometry(); checkObservation(end);
        JSONObject css = cssGeometry(); checkObservation(end); assertNativeContentBounds(nativeState, css); checkObservation(end);
        JSONObject state = new JSONObject(evaluate("(()=>{const describe=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);"
            + "let l=0,t=0,right=innerWidth,bottom=innerHeight,p=e.parentElement,n=0,unsupported=s.transform!=='none',visible=s.visibility==='visible'&&s.display!=='none'&&s.opacity==='1';const scroll=[];"
            + "for(;p&&n<16;p=p.parentElement,n++){const q=p.getBoundingClientRect(),c=getComputedStyle(p);unsupported ||= c.transform!=='none';visible &&= c.visibility==='visible'&&c.display!=='none'&&c.opacity==='1';"
            + "if(c.overflowX!=='visible'){l=Math.max(l,q.left+p.clientLeft);right=Math.min(right,q.left+p.clientLeft+p.clientWidth);}"
            + "if(c.overflowY!=='visible'){t=Math.max(t,q.top+p.clientTop);bottom=Math.min(bottom,q.top+p.clientTop+p.clientHeight);}"
            + "if(p.scrollHeight>p.clientHeight||p.scrollWidth>p.clientWidth||p.scrollTop||p.scrollLeft)scroll.push({left:p.scrollLeft,top:p.scrollTop,width:p.clientWidth,height:p.clientHeight,scrollWidth:p.scrollWidth,scrollHeight:p.scrollHeight});}"
            + "return {rect:r.toJSON(),clip:{left:l,top:t,right,bottom},scroll,chainComplete:!p,unsupportedTransform:unsupported,visible,color:s.color,background:s.backgroundColor,outline:s.outline,naturalWidth:e.naturalWidth??null,naturalHeight:e.naturalHeight??null};};"
            + "const root=getComputedStyle(document.documentElement),dialog=" + DIALOG + ",focused=document.activeElement;return {timeOrigin:String(performance.timeOrigin),visibility:document.visibilityState,documentFocused:document.hasFocus(),appliedTheme:document.documentElement.dataset.clippTheme,systemDark:matchMedia('(prefers-color-scheme: dark)').matches,"
            + "palette:{colorScheme:root.colorScheme,color:root.color,rootBackground:root.backgroundColor,bodyBackground:getComputedStyle(document.body).backgroundColor,portalBackground:dialog?getComputedStyle(dialog).backgroundColor:null},"
            + "focus:focused?{label:(focused.getAttribute('aria-label')||'').slice(0,80),rect:focused.getBoundingClientRect().toJSON(),color:getComputedStyle(focused).color,background:getComputedStyle(focused).backgroundColor,outline:getComputedStyle(focused).outline}:null,"
            + "messages:[...document.querySelectorAll('[role=alert],[role=status]')].filter(e=>e.getClientRects().length).slice(0,6).map(e=>({text:e.textContent.trim().slice(0,180),color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor})),"
            + "pageScroll:{x:scrollX,y:scrollY},target:describe(" + element + "),qr:" + (qr ? "describe(document.querySelector('img[alt=\"Pairing QR\"]'))" : "null")
            + ",qrSourceMatches:" + (qr ? "document.querySelector('img[alt=\"Pairing QR\"]')?.currentSrc===" + JSONObject.quote(generatedQrImage) : "null") + "};})()"));
        checkObservation(end);
        assertEquals("Owned document must remain visible", "visible", state.getString("visibility"));
        assertTrue("Owned document must remain focused", state.getBoolean("documentFocused"));
        JSONObject box = state.getJSONObject("target").getJSONObject("rect");
        assertTrue("The fixed public capture target exists with positive dimensions", box.getDouble("width") > 0 && box.getDouble("height") > 0);
        if (qr) assertTrue("Capture uses the actual generated public QR", state.getBoolean("qrSourceMatches"));
        assertSameDocument(); checkObservation(end);
        return new JSONObject().put("observedUptimeMs", SystemClock.uptimeMillis())
            .put("frame", new JSONObject().put("owner", ownerProof.get()).put("native", nativeState).put("css", css).put("public", state));
    }

    private JSONObject renderedQrCrop(JSONObject frame, CapturePixels pixels) throws Exception {
        JSONObject view = frame.getJSONObject("native").getJSONObject("webViewPx"), css = frame.getJSONObject("css");
        JSONObject qr = frame.getJSONObject("public").getJSONObject("qr"), box = qr.getJSONObject("rect"), clip = qr.getJSONObject("clip");
        double ratio = view.getDouble("width") / css.getDouble("viewportWidth");
        int left = (int) Math.floor(view.getDouble("left") + box.getDouble("left") * ratio);
        int top = (int) Math.floor(view.getDouble("top") + box.getDouble("top") * ratio);
        int right = (int) Math.ceil(view.getDouble("left") + box.getDouble("right") * ratio);
        int bottom = (int) Math.ceil(view.getDouble("top") + box.getDouble("bottom") * ratio);
        JSONObject usable = nativeUsableScreen(frame.getJSONObject("native"));
        boolean complete = qr.getBoolean("chainComplete") && !qr.getBoolean("unsupportedTransform") && qr.getBoolean("visible")
            && qr.getInt("naturalWidth") > 0 && qr.getInt("naturalWidth") == qr.getInt("naturalHeight")
            && Math.abs(box.getDouble("width") - box.getDouble("height")) * ratio <= 1
            && box.getDouble("left") >= clip.getDouble("left") && box.getDouble("top") >= clip.getDouble("top")
            && box.getDouble("right") <= clip.getDouble("right") && box.getDouble("bottom") <= clip.getDouble("bottom")
            && left >= 0 && top >= 0 && right <= pixels.width && bottom <= pixels.height && right > left && bottom > top
            && left >= usable.getInt("left") && top >= usable.getInt("top")
            && right <= usable.getInt("left") + usable.getInt("width") && bottom <= usable.getInt("top") + usable.getInt("height");
        return new JSONObject().put("completeImageBoundsInFrame", complete)
            .put("cropPx", complete ? rect(left, top, right - left, bottom - top) : JSONObject.NULL)
            .put("measuredPhysicalCssRatio", ratio).put("publicDataUrlSha256", sha(generatedQrImage.getBytes(StandardCharsets.UTF_8)))
            .put("meaning", "Full rendered image including encoded quiet-zone margin; actual pixel decode/quiet-zone review still required")
            .put("decodeClaimed", false).put("clippedOrUnsupported", !complete);
    }

    private boolean captureTargetComplete(JSONObject frame, CapturePixels pixels) throws Exception {
        JSONObject target = frame.getJSONObject("public").getJSONObject("target"), box = target.getJSONObject("rect"), clip = target.getJSONObject("clip");
        JSONObject view = frame.getJSONObject("native").getJSONObject("webViewPx"), usable = nativeUsableScreen(frame.getJSONObject("native"));
        double ratio = view.getDouble("width") / frame.getJSONObject("css").getDouble("viewportWidth");
        double left = view.getDouble("left") + box.getDouble("left") * ratio, top = view.getDouble("top") + box.getDouble("top") * ratio;
        double right = view.getDouble("left") + box.getDouble("right") * ratio, bottom = view.getDouble("top") + box.getDouble("bottom") * ratio;
        return target.getBoolean("chainComplete") && !target.getBoolean("unsupportedTransform") && target.getBoolean("visible")
            && box.getDouble("left") >= clip.getDouble("left") && box.getDouble("top") >= clip.getDouble("top")
            && box.getDouble("right") <= clip.getDouble("right") && box.getDouble("bottom") <= clip.getDouble("bottom")
            && left >= Math.max(0, usable.getDouble("left")) - 1 && top >= Math.max(0, usable.getDouble("top")) - 1
            && right <= Math.min(pixels.width, usable.getDouble("left") + usable.getDouble("width")) + 1
            && bottom <= Math.min(pixels.height, usable.getDouble("top") + usable.getDouble("height")) + 1;
    }

    private static final class CapturePixels {
        final byte[] png; final int width, height; final long started, finished;
        CapturePixels(byte[] png, int width, int height, long started, long finished) {
            this.png = png; this.width = width; this.height = height; this.started = started; this.finished = finished;
        }
    }

    private void checkCaptureWorker(AtomicBoolean request, long end) throws IOException {
        if (captureRetired.get() || !request.get() || Thread.currentThread().isInterrupted() || SystemClock.uptimeMillis() >= end)
            throw new IOException("Capture retired or deadline exceeded");
    }

    private CapturePixels capturePixels(AtomicBoolean request, long end) throws Exception {
        Bitmap bitmap = null;
        try {
            checkCaptureWorker(request, end);
            UiAutomation automation = instrumentation.getUiAutomation(); checkCaptureWorker(request, end);
            long started = SystemClock.uptimeMillis();
            bitmap = automation.takeScreenshot();
            long finished = SystemClock.uptimeMillis();
            checkCaptureWorker(request, end);
            assertNotNull("Actual screenshot required; no source-image fallback", bitmap);
            int width = bitmap.getWidth(), height = bitmap.getHeight();
            assertTrue("Bound actual bitmap pixels", width > 0 && height > 0 && (long) width * height <= MAX_CAPTURE_PIXELS);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            OutputStream bounded = new OutputStream() {
                @Override public void write(int value) throws IOException {
                    checkCaptureWorker(request, end); if (bytes.size() >= MAX_PNG_BYTES) throw new IOException("PNG byte cap"); bytes.write(value);
                }
                @Override public void write(byte[] value, int offset, int count) throws IOException {
                    checkCaptureWorker(request, end); if (count > MAX_PNG_BYTES - bytes.size()) throw new IOException("PNG byte cap"); bytes.write(value, offset, count);
                }
            };
            assertTrue("Actual PNG encoding must succeed", bitmap.compress(Bitmap.CompressFormat.PNG, 100, bounded));
            checkCaptureWorker(request, end);
            assertTrue("Nonempty capped actual PNG", bytes.size() > 0 && bytes.size() <= MAX_PNG_BYTES);
            return new CapturePixels(bytes.toByteArray(), width, height, started, finished);
        } finally {
            if (bitmap != null) bitmap.recycle(); // Includes null/error/oversize/cancel/late-return paths.
        }
    }

    private void retireCaptureWorker() throws Exception {
        captureRetired.set(true);
        if (pendingCapture != null) pendingCapture.cancel(true);
        if (captureWorker == null) { captureWorkerClosed = true; return; }
        captureWorker.shutdownNow();
        long remaining = Math.max(0, Math.min(1000, deadline - SystemClock.uptimeMillis()));
        captureWorkerClosed = captureWorker.awaitTermination(remaining, TimeUnit.MILLISECONDS);
        assertTrue("Capture worker termination requires confirmation; late workers cannot publish", captureWorkerClosed);
    }

    private void captureOwner() throws Exception { web.onActivity(activity -> { owner = activity; ownerWebView = activity.getBridge().getWebView(); }); checkDeadline(); timeOrigin = evaluate("performance.timeOrigin"); }
    private boolean sameDocument() throws Exception { AtomicBoolean same = new AtomicBoolean(); web.onActivity(activity -> same.set(activity == owner && activity.getBridge().getWebView() == ownerWebView)); checkDeadline(); return same.get() && timeOrigin.equals(evaluate("performance.timeOrigin")); }
    private void assertSameDocument() throws Exception { assertTrue("Live geometry journey requires same Activity/WebView/document; otherwise unqualified", sameDocument()); }
    private void tap(String selector) throws Exception { checkDeadline(); web.tap(selector); checkDeadline(); }
    private void tapButton(String label) throws Exception { tap(web.button(label)); }
    private void key(int code) { checkDeadline(); instrumentation.sendKeyDownUpSync(code); checkDeadline(); }
    private void nativeBack() { key(KeyEvent.KEYCODE_BACK); }
    private void hideIme() throws Exception { nativeBack(); awaitIme(false); }
    private boolean nativeImeVisible() throws Exception { return nativeGeometry().getBoolean("imeVisible"); }
    private void awaitIme(boolean expected) throws Exception {
        long end = Math.min(deadline, SystemClock.uptimeMillis() + OBSERVATION_MS);
        do { checkObservation(end); boolean visible = nativeImeVisible(); checkObservation(end); if (visible == expected) return; SystemClock.sleep(50); } while (SystemClock.uptimeMillis() < end);
        throw new AssertionError("Actual native IME state unmet; expected=" + expected);
    }
    private void replaceText(String selector, String value) throws Exception {
        tap(selector); awaitIme(true); long down = SystemClock.uptimeMillis();
        for (int action : new int[]{KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP}) {
            KeyEvent event = new KeyEvent(down, SystemClock.uptimeMillis(), action, KeyEvent.KEYCODE_A, 0, KeyEvent.META_CTRL_ON);
            event.setSource(InputDevice.SOURCE_KEYBOARD); instrumentation.sendKeySync(event);
        }
        checkDeadline(); instrumentation.sendStringSync(value); awaitUi("actual Android typed raw text", "(" + selector + ").value===" + JSONObject.quote(value));
    }
    private void awaitRawFocused(String selector, String raw) throws Exception { awaitUi("retained raw/error field and focus", "(" + selector + ")?.value===" + JSONObject.quote(raw) + "&&document.activeElement===(" + selector + ")"); }
    private void assertFocusedButton(String name) throws Exception { awaitUi("logical public return focus", "document.activeElement===(" + web.button(name) + ")"); }
    private void awaitDialog(String title) throws Exception { awaitUi("actual task " + title, "(()=>{const d=" + DIALOG + ";return !!d&&document.getElementById(d.getAttribute('aria-labelledby'))?.textContent.trim()===" + JSONObject.quote(title) + "})()"); }
    private void awaitNoDialog() throws Exception { awaitUi("task dismissed one level to workspace", "!(" + DIALOG + ")"); }
    private void awaitUi(String description, String expression) throws Exception {
        awaitUiUntil(Math.min(deadline, SystemClock.uptimeMillis() + OBSERVATION_MS), description, expression);
    }
    private void awaitUiUntil(long end, String description, String expression) throws Exception {
        do { checkObservation(end); boolean ready = "true".equals(evaluate(expression)); checkObservation(end); if (ready) return; SystemClock.sleep(50); } while (SystemClock.uptimeMillis() < end);
        throw new AssertionError("Public condition unmet: " + description);
    }
    private String evaluate(String expression) throws Exception { checkDeadline(); String value = web.evaluate(expression); checkDeadline(); return value; }
    private void completeJourney() throws Exception {
        if (captureEnabled) {
            assertEquals("All admitted images are required", requiredCaptureStages().length, captures.length());
            for (int i = 0; i < captures.length(); i++) assertEquals("No missing/failed capture can qualify", "COMPLETE", captures.getJSONObject(i).getString("status"));
        }
        checkDeadline(); passed = true;
    }
    private void emitDuringJourney(String text) { checkDeadline(); emit(text); checkDeadline(); }
    private void checkDeadline() { assertTrue("Selected profile journey180s deadline", SystemClock.uptimeMillis() < deadline); }
    private void checkObservation(long end) { checkDeadline(); assertTrue("Finite20s observation/checkpoint deadline", SystemClock.uptimeMillis() < end); }

    private void installFirstDrawObserver() {
        application = (Application) target.getApplicationContext();
        drawObserver = new Application.ActivityLifecycleCallbacks() {
            @Override public void onActivityCreated(Activity activity, Bundle state) {
                if (!(activity instanceof MainActivity) || firstDraw.get() != null || firstDrawError.get() != null) return;
                View decor = activity.getWindow().getDecorView();
                decor.getViewTreeObserver().addOnDrawListener(new ViewTreeObserver.OnDrawListener() {
                    @Override public void onDraw() {
                        if (firstDraw.get() != null || firstDrawError.get() != null) return;
                        try { firstDraw.compareAndSet(null, new JSONObject().put("uptimeMs", SystemClock.uptimeMillis())
                            .put("nativeDecorBackground", drawable(decor.getBackground()))
                            .put("systemDark", (activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES)
                            .put("meaning", "first observed native decor draw; not a pre-first-CSS-paint claim")); }
                        catch (Throwable error) { firstDrawError.compareAndSet(null, error.getClass().getName() + ": " + String.valueOf(error.getMessage())); }
                        finally { decor.post(() -> { if (decor.getViewTreeObserver().isAlive()) decor.getViewTreeObserver().removeOnDrawListener(this); }); }
                    }
                });
            }
            @Override public void onActivityStarted(Activity activity) {}
            @Override public void onActivityResumed(Activity activity) {}
            @Override public void onActivityPaused(Activity activity) {}
            @Override public void onActivityStopped(Activity activity) {}
            @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
            @Override public void onActivityDestroyed(Activity activity) {}
        };
        application.registerActivityLifecycleCallbacks(drawObserver);
    }

    @After
    public void retainBoundedActualWitnessAndCloseOnlyOwnedActivity() throws Exception {
        if (directory == null) return;
        List<Throwable> failures = new ArrayList<>(); boolean closed = false;
        try { retireCaptureWorker(); } catch (Throwable e) { failures.add(e); }
        try { if (scenario != null) { NativePublicWebView.closeScenarioBounded(scenario); closed = true; } } catch (Throwable e) { failures.add(e); }
        try { if (application != null && drawObserver != null) application.unregisterActivityLifecycleCallbacks(drawObserver); } catch (Throwable e) { failures.add(e); }
        try {
            JSONObject witness = new JSONObject().put("rootNonce", nonce).put("case", selectedCase).put("contract", contract)
                .put("selectedJourneyPassed", passed).put("activityCleanupComplete", closed).put("trace", trace)
                .put("firstNativeDraw", firstDraw.get() == null ? JSONObject.NULL : firstDraw.get())
                .put("firstNativeDrawError", firstDrawError.get() == null ? JSONObject.NULL : firstDrawError.get())
                .put("qrPublicImage", generatedQrImage == null ? JSONObject.NULL : generatedQrImage)
                .put("captureEnabled", captureEnabled).put("captureWorkerClosed", captureWorkerClosed).put("captures", captures)
                .put("expectedCaptureCount", captureEnabled ? requiredCaptureStages().length : 0)
                .put("qrDecodeOrScannerQualified", false).put("rootActualBackgroundContrastAndScreenshotsStillRequired", true)
                .put("rootProcessRestartAndDataContinuityProofStillRequired", selectedCase.startsWith("theme"))
                .put("destroyedDocumentDraftSurvivalClaimed", false).put("navMode", "root assignment/readback only; not inferred from native inset height")
                .put("rootJUnitGuestClosureAndProfileEvidenceStillRequired", true);
            byte[] bytes = witness.toString().getBytes(StandardCharsets.UTF_8); assertTrue("Capped actual public/native witness", bytes.length <= MAX_WITNESS_BYTES);
            File output = new File(directory, "public-witness.json"); assertTrue("Exclusive fresh witness", output.createNewFile());
            try (FileOutputStream stream = new FileOutputStream(output)) { stream.write(bytes); }
            emit("artifact=" + output.getAbsolutePath() + ";bytes=" + bytes.length + ";sha256=" + sha(bytes));
        } catch (Throwable e) { failures.add(e); }
        MultipleFailureException.assertEmpty(failures);
    }
    private String readAsset(String name) throws Exception {
        try (InputStream stream = target.getAssets().open(name); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096]; int count; while ((count = stream.read(buf)) != -1) { out.write(buf, 0, count); assertTrue("Packaged public asset cap", out.size() <= 32768); }
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
    private static JSONObject rect(int left, int top, int width, int height) throws Exception { return new JSONObject().put("left", left).put("top", top).put("width", width).put("height", height); }
    private static JSONObject inset(Insets i) throws Exception { return new JSONObject().put("left", i.left).put("top", i.top).put("right", i.right).put("bottom", i.bottom); }
    private static JSONObject drawable(Drawable d) throws Exception { return new JSONObject().put("type", d == null ? JSONObject.NULL : d.getClass().getName()).put("argb", d instanceof ColorDrawable ? ((ColorDrawable) d).getColor() : JSONObject.NULL); }
    private static String sha(byte[] bytes) throws Exception { StringBuilder hex = new StringBuilder(); for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) hex.append(String.format(java.util.Locale.ROOT, "%02x", b & 255)); return hex.toString(); }
    private void emit(String text) { Bundle status = new Bundle(); status.putString(Instrumentation.REPORT_KEY_STREAMRESULT, "NAV19_PROFILES nonce=" + nonce + ";" + text + "\n"); instrumentation.sendStatus(0, status); }
}
