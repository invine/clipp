package com.clipp.app;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.util.TypedValue;
import android.view.InputDevice;
import android.view.KeyEvent;
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
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
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
 * N1 only: real exported text Intents and native input against ordinary packaged MainActivity.
 * Root invokes this method alone with navigationMatrixAcceptance=true,
 * navigationMatrixProfile=ordinary-default and a fresh navigationMatrixRootNonce (16..64 ASCII
 * letters/digits/_/-). Root owns a fresh isolated guest, empty clipboard baseline, network
 * isolation, normal APK provenance and the outer process deadline. No Copy is performed.
 *
 * DOM reads locate/witness public controls; NativePublicWebView supplies guarded physical
 * taps and Android supplies text/keys. No product command, fixture props, private owner,
 * store/queue write, synthetic pending request or test global is installed. This method
 * does not qualify reflow profiles, themes, pending entry, scanner, retention or restart.
 */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class NavigationTaskReflowTest {
    private static final long UI_TIMEOUT_MS = 20_000;
    private static final long JOURNEY_TIMEOUT_MS = 180_000;
    private static final int MAX_WITNESS_BYTES = 96 * 1024;
    private static final String QUERY = "document.querySelector('input[aria-label=\"Search history\"]')";
    private static final String NAME = "document.querySelector('input[aria-label=\"Device Name\"]')";
    private static final String CARDS = "[...document.querySelectorAll('.history-card[data-clip-id]')]";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final JSONArray trace = new JSONArray();
    private final JSONArray ingress = new JSONArray();
    private final List<String> markers = new ArrayList<>();
    private final List<String> ids = new ArrayList<>();
    private ActivityScenario<MainActivity> scenario;
    private NativePublicWebView web;
    private Context target;
    private File directory;
    private String nonce;
    private long deadline;
    private String documentTimeOrigin;
    private MainActivity owner;
    private WebView ownerWebView;
    private String selectedId;
    private String selectedMarker;
    private String retainedQuery;
    private String draft;
    private boolean journeyPassed;

    @Before
    public void requireFreshOrdinaryPackagedRootInterval() throws Exception {
        Bundle arguments = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Explicit root-owned N1 interval required",
            "true".equals(arguments.getString("navigationMatrixAcceptance")));
        target = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(target.getPackageName());
        assertEquals("Only the agreed ordinary/default N1 profile is implemented",
            "ordinary-default", arguments.getString("navigationMatrixProfile", ""));
        nonce = arguments.getString("navigationMatrixRootNonce", "");
        assertTrue("Fresh bounded ASCII interval nonce required", nonce.matches("[A-Za-z0-9_-]{16,64}"));
        JSONObject config = new JSONObject(readAsset("capacitor.config.json", 32_768));
        JSONObject server = config.optJSONObject("server");
        assertTrue("Packaged HTTPS assets required; no development URL", server == null
            || (!server.has("url") && "localhost".equals(server.optString("hostname", "localhost"))
                && "https".equals(server.optString("androidScheme", "https"))));
        String index = readAsset("public/index.html", 32_768);
        assertFalse("Owning reset entry is not this ordinary consumer", index.contains("clipp-reset-owning-manifest"));
        assertFalse("Owning reset progress is refused", index.contains("clipp-reset-owning-progress"));
        assertFalse("Storage-only replacement entry is refused", index.contains("__identityResetAcceptance"));
        File candidate = new File(target.getCacheDir(), "navigation19-matrix-" + nonce);
        assertTrue("Preserve prior artifacts; use a fresh root nonce", !candidate.exists() && candidate.mkdir());
        directory = candidate;
        deadline = SystemClock.uptimeMillis() + JOURNEY_TIMEOUT_MS;
        scenario = ActivityScenario.launch(MainActivity.class);
        web = new NativePublicWebView(instrumentation, scenario);
        awaitUi("ordinary packaged workspace", "!!document.querySelector('nav[aria-label=\"Clipp destinations\"]')");
        assertEquals("Ordinary HTTPS origin", "https://localhost/", web.evaluate("location.origin + '/'"));
        assertEquals("No reset progress may be mounted", "false", web.evaluate("!!document.getElementById('clipp-reset-owning-progress')"));
        web.onActivity(activity -> {
            owner = activity;
            ownerWebView = activity.getBridge().getWebView();
            assertEquals("Root must deliver actual default OS text", 1f,
                activity.getResources().getConfiguration().fontScale, 0.001f);
        });
        documentTimeOrigin = web.evaluate("performance.timeOrigin");
        awaitUi("actual native geometry", "document.documentElement.dataset.hostGeometry === 'android' && document.fonts.status === 'loaded'");
        JSONObject geometry = nativeGeometry();
        assertTrue("N1 requires an ordinary portrait native window",
            geometry.getJSONObject("webViewPx").getInt("height") > geometry.getJSONObject("webViewPx").getInt("width"));
        JSONObject css = new JSONObject(web.evaluate("({width:parseFloat(document.documentElement.style.getPropertyValue('--clipp-content-width')),height:parseFloat(document.documentElement.style.getPropertyValue('--clipp-content-height'))})"));
        assertTrue("N1 requires delivered ordinary phone content, not a short/enlarged profile",
            css.getDouble("width") > 320 && css.getDouble("width") < 600 && css.getDouble("height") > 500);
        awaitIme(false);
        openDestination("history");
        awaitUi("real fresh empty History baseline", CARDS + ".length === 0 && [...document.querySelectorAll('.history-text')].some(e => e.textContent === 'No history yet.')"
            + " && !document.querySelector('[data-session-scroll=\"history\"] .initialization-error')"
            + " && ![...document.querySelectorAll('[role=status]')].some(e => e.getClientRects().length && e.textContent.trim() === 'Loading History…')");
        observe("fresh-empty-ready");
    }

    @Test
    public void nativeIngressSearchFiltersAndDestinationsRetainNameDraft() throws Exception {
        for (int index = 0; index < 6; index++) {
            String marker = "nav19-" + nonce + "-clip-" + index;
            markers.add(marker);
            String text = marker + " ";
            int length = index == 0 ? 4096 : index == 1 ? 1024 : 192;
            String body = index == 0 ? "long native navigation line\n" : index == 1 ? "unbroken" : "short ";
            StringBuilder content = new StringBuilder(text);
            while (content.length() < length) content.append(body);
            content.setLength(length);
            ids.add(nativeIngress(index == 1 ? Intent.ACTION_PROCESS_TEXT : Intent.ACTION_SEND, marker, content.toString()));
        }
        assertEquals("Six genuine events must have six immutable public Clip IDs", 6, new HashSet<>(ids).size());
        assertMarkerAssociations(6);
        selectedId = web.evaluate(CARDS + ".at(-1).dataset.clipId");
        int selectedIndex = ids.indexOf(selectedId);
        assertTrue("The final public History card must belong to this genuine ingress interval", selectedIndex >= 0);
        selectedMarker = markers.get(selectedIndex);
        tap(card(selectedId) + ".querySelector('button[aria-label=\"Pin Clip\"]')");
        awaitUi("native Pin applies to the selected final Clip", card(selectedId)
            + ".querySelector('button[aria-label=\"Pin Clip\"]').getAttribute('aria-pressed') === 'true'");
        chooseScope("Pinned");
        awaitOnlySelectedClip();
        observe("real-ingress-final-card-pinned");

        openDestination("devices");
        awaitUi("actual self Peer ID is inspectable", "!!document.querySelector('.peer-item.active .peer-sub[title]')");
        String peerId = web.evaluate("document.querySelector('.peer-item.active .peer-sub').getAttribute('title')");
        assertTrue("The actual public identity must be a bounded Peer ID", peerId.matches("[A-Za-z0-9]{32,128}"));
        replaceText(QUERY, selectedMarker);
        awaitUi("Search from Devices reaches actual History", selectedDestination("history"));
        hideIme();
        awaitOnlySelectedClip();
        assertScope("Pinned");
        openDestination("settings");
        replaceText(QUERY, "nav19-" + nonce + "-no-match");
        awaitUi("Search from Settings reaches actual History", selectedDestination("history"));
        hideIme();
        awaitUi("Pinned no-match is distinct from empty History", CARDS + ".length === 0 && [...document.querySelectorAll('.history-text')].some(e => e.textContent.includes('No Clips match') && e.textContent.includes('Pinned'))");
        tap(web.button("Clear search"));
        awaitUi("native Clear search retains Pinned scope", QUERY + ".value === ''");
        assertScope("Pinned");
        awaitOnlySelectedClip();
        chooseScope("All");
        assertMarkerAssociations(6);
        chooseScope("Pinned");
        retainedQuery = selectedMarker;
        replaceText(QUERY, retainedQuery);
        hideIme();
        awaitOnlySelectedClip();
        openDestination("requests");
        awaitUi("genuine current empty Requests, not loading or unavailable", "[...document.querySelectorAll('.destination-pane p')].some(e => e.textContent === 'No pending requests.')"
            + " && ![...document.querySelectorAll('.destination-pane [role=status]')].some(e => e.textContent.includes('Loading Requests'))"
            + " && ![...document.querySelectorAll('.destination-pane [role=alert]')].some(e => e.textContent.includes('Requests are unavailable'))");
        openDestination("history");
        assertQueryAndScope();
        awaitOnlySelectedClip();
        observe("four-destinations-search-clear-scope");

        openDestination("devices");
        tap(web.button("Rename this device"));
        awaitUi("actual Device Name task", "!!(" + NAME + ")");
        StringBuilder name = new StringBuilder("N1-" + nonce + "-");
        while (name.length() < 64) name.append('x');
        draft = name.substring(0, 64);
        replaceText(NAME, draft);
        awaitUi("exact64-character raw draft", NAME + ".value === " + JSONObject.quote(draft));
        assertEquals(64, draft.length());
        nativeBack();
        awaitIme(false);
        assertRetainedName();
        observe("ime-first-back-retains-name");
        tap(web.button("Close name editor"));
        awaitUi("Close returns to the actual Devices invoker", "!(" + NAME + ") && document.activeElement === (" + web.button("Rename this device") + ")");
        assertQueryAndScope();
        tap(web.button("Rename this device"));
        assertRetainedName();
        assertNoHorizontalPageHunting();
        assertSameDocument();
        observe("close-reopen-retains-draft-query-scope-focus");
        checkDeadline();
        journeyPassed = true;
    }

    private String nativeIngress(String action, String marker, String text) throws Exception {
        checkDeadline();
        assertTrue("Bounded synthetic ingress only", text.length() <= 4096 && text.startsWith(marker + " "));
        Intent intent = new Intent(target, ExplicitTextIngressActivity.class).setAction(action)
            .setType("text/plain").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Intent.ACTION_PROCESS_TEXT.equals(action)) {
            intent.putExtra(Intent.EXTRA_PROCESS_TEXT, text).putExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, true);
        } else intent.putExtra(Intent.EXTRA_TEXT, text);
        long dispatched = SystemClock.uptimeMillis();
        target.startActivity(intent);
        awaitForeground();
        awaitUi("one actual public Clip for the exported native event", matches(marker) + ".length === 1");
        String id = web.evaluate(matches(marker) + "[0].dataset.clipId");
        assertTrue("Actual captured Clip must expose its UUIDv4 event ID", id.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"));
        assertFalse("No prior native event may reuse this ID", ids.contains(id));
        ingress.put(new JSONObject().put("action", action).put("marker", marker).put("clipId", id)
            .put("chars", text.length()).put("textSha256", sha(text.getBytes(StandardCharsets.UTF_8)))
            .put("dispatchedUptimeMs", dispatched).put("observedUptimeMs", SystemClock.uptimeMillis()));
        return id;
    }

    private void assertMarkerAssociations(int expected) throws Exception {
        awaitUi("exact public interval card count", CARDS + ".length === " + expected);
        for (int index = 0; index < ids.size(); index++) {
            assertEquals("Each native marker must remain single in public History", "1", web.evaluate(matches(markers.get(index)) + ".length"));
            assertEquals("The marker must retain its own actual Clip ID", ids.get(index), web.evaluate(matches(markers.get(index)) + "[0].dataset.clipId"));
        }
    }

    private void openDestination(String destination) throws Exception {
        String button = "document.querySelector('nav[aria-label=\"Clipp destinations\"] [data-session-focus=\"destination:" + destination + "\"]')";
        assertEquals("Named navigation target exists", "true", web.evaluate("!!(" + button + ") && (" + button + ").textContent.trim().toLowerCase().startsWith(" + JSONObject.quote(destination) + ")"));
        tap(button);
        awaitUi("actual destination " + destination, selectedDestination(destination));
        if (!"history".equals(destination)) awaitUi("actual owning destination heading", "document.querySelector('.destination-pane h1')?.textContent.toLowerCase() === " + JSONObject.quote(destination));
        assertWorkspaceControls();
        assertNoHorizontalPageHunting();
    }

    private String selectedDestination(String destination) {
        return "document.querySelector('nav [aria-current=\"page\"]')?.getAttribute('data-session-focus') === " + JSONObject.quote("destination:" + destination);
    }

    private void chooseScope(String label) throws Exception {
        if (!"true".equals(web.evaluate("(" + web.button("Filters") + ").getAttribute('aria-expanded') === 'true'"))) tap(web.button("Filters"));
        tap(web.button(label));
        assertScope(label);
    }

    private void assertScope(String label) throws Exception {
        awaitUi("one actual selected History scope " + label, "[...document.querySelectorAll('[aria-label=\"History filters\"] button')].filter(e => e.textContent.trim() === "
            + JSONObject.quote(label) + " && e.getAttribute('aria-pressed') === 'true').length === 1");
    }

    private void assertQueryAndScope() throws Exception {
        assertEquals("The actual document-lived query must remain", retainedQuery, web.evaluate(QUERY + ".value"));
        assertScope("Pinned");
    }

    private void awaitOnlySelectedClip() throws Exception {
        awaitUi("Pinned/query identifies the same real Clip", CARDS + ".length === 1 && " + CARDS + "[0].dataset.clipId === " + JSONObject.quote(selectedId));
    }

    private void replaceText(String element, String value) throws Exception {
        tap(element);
        awaitIme(true);
        long time = SystemClock.uptimeMillis();
        for (int action : new int[]{KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP}) {
            KeyEvent key = new KeyEvent(time, SystemClock.uptimeMillis(), action, KeyEvent.KEYCODE_A, 0, KeyEvent.META_CTRL_ON);
            key.setSource(InputDevice.SOURCE_KEYBOARD);
            instrumentation.sendKeySync(key);
        }
        instrumentation.sendStringSync(value);
        awaitUi("actual Android typed text", "(" + element + ").value === " + JSONObject.quote(value));
    }

    private void nativeBack() { checkDeadline(); instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); }
    private void hideIme() throws Exception { nativeBack(); awaitIme(false); }
    private void tap(String element) throws Exception { checkDeadline(); web.tap(element); }

    private void assertRetainedName() throws Exception {
        awaitUi("retained raw Device Name and logical editor focus", "(" + NAME + ")?.value === " + JSONObject.quote(draft)
            + " && document.activeElement === (" + NAME + ")");
        assertQueryAndScope();
    }

    private void assertWorkspaceControls() throws Exception {
        assertEquals("Search and one Filters control remain present on every destination", "true", web.evaluate("!!(" + QUERY + ") && [...document.querySelectorAll('.workspace-controls button')].filter(e => e.textContent.trim() === 'Filters').length === 1"
            + " && document.querySelector('.app-bar').getBoundingClientRect().bottom <= document.querySelector('.workspace-controls').getBoundingClientRect().top + 1"
            + " && [...document.querySelectorAll('.app-bar button')].some(e => e.textContent.trim().startsWith('Auto Sync:'))"));
        JSONObject nativeFrame = nativeGeometry();
        double ratio = nativeFrame.getJSONObject("webViewPx").getInt("width")
            / Double.parseDouble(web.evaluate("document.documentElement.getBoundingClientRect().width"));
        double density = nativeFrame.getDouble("density");
        JSONArray nav = new JSONArray(web.evaluate("[...document.querySelectorAll('nav[aria-label=\"Clipp destinations\"] button')].map(e => ({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,name:e.textContent.trim()}))"));
        assertEquals("Four named destinations", 4, nav.length());
        for (int index = 0; index < nav.length(); index++) {
            JSONObject rect = nav.getJSONObject(index);
            assertTrue("Each actual navigation target retains48dp width/height intent: " + rect.getString("name"),
                rect.getDouble("width") * ratio / density >= 48 && rect.getDouble("height") * ratio / density >= 48);
        }
    }

    private void assertNoHorizontalPageHunting() throws Exception {
        assertEquals("Ordinary app content must not require horizontal page hunting", "true", web.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && document.body.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.app-shell,[role=dialog]')].every(e => e.scrollWidth <= e.clientWidth + 1)"));
    }

    private void assertSameDocument() throws Exception {
        web.onActivity(activity -> assertTrue("N1 retains the same ordinary owner and WebView", activity == owner && activity.getBridge().getWebView() == ownerWebView));
        assertEquals("N1 retains one live document", documentTimeOrigin, web.evaluate("performance.timeOrigin"));
    }

    private void awaitForeground() throws Exception {
        checkDeadline();
        long end = Math.min(deadline, SystemClock.uptimeMillis() + UI_TIMEOUT_MS);
        AtomicBoolean ready = new AtomicBoolean();
        do {
            checkObservationDeadline(end, "foreground");
            web.onActivity(activity -> ready.set(activity.hasWindowFocus()
                && activity.getLifecycle().getCurrentState() == androidx.lifecycle.Lifecycle.State.RESUMED));
            checkObservationDeadline(end, "foreground");
            if (ready.get()) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        throw new AssertionError("The actual isolated MainActivity did not regain foreground");
    }

    private void awaitIme(boolean expected) throws Exception {
        checkDeadline();
        long end = Math.min(deadline, SystemClock.uptimeMillis() + UI_TIMEOUT_MS);
        AtomicBoolean visible = new AtomicBoolean();
        do {
            checkObservationDeadline(end, "IME");
            web.onActivity(activity -> {
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(activity.getBridge().getWebView());
                assertNotNull("Native IME insets must be available", insets);
                visible.set(insets.isVisible(WindowInsetsCompat.Type.ime()));
            });
            checkObservationDeadline(end, "IME");
            if (visible.get() == expected) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        throw new AssertionError("Native IME state unconfirmed; expected=" + expected);
    }

    private void awaitUi(String description, String expression) throws Exception {
        checkDeadline();
        long end = Math.min(deadline, SystemClock.uptimeMillis() + UI_TIMEOUT_MS);
        do {
            checkObservationDeadline(end, description);
            boolean confirmed = "true".equals(web.evaluate(expression));
            checkObservationDeadline(end, description);
            if (confirmed) return;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        throw new AssertionError("Public N1 condition unconfirmed: " + description);
    }

    private void checkDeadline() { assertTrue("N1 journey exceeded its bounded owner deadline", SystemClock.uptimeMillis() < deadline); }

    private void checkObservationDeadline(long localDeadline, String description) {
        checkDeadline();
        assertTrue("N1 observation exceeded its local deadline: " + description, SystemClock.uptimeMillis() < localDeadline);
    }

    private String matches(String marker) {
        return CARDS + ".filter(e => e.querySelector('.history-text')?.textContent.startsWith(" + JSONObject.quote(marker + " ") + "))";
    }

    private String card(String id) { return "document.querySelector('[data-clip-id=" + JSONObject.quote(id) + "]')"; }

    private JSONObject nativeGeometry() throws Exception {
        AtomicReference<JSONObject> result = new AtomicReference<>();
        web.onActivity(activity -> {
            try {
                WebView view = activity.getBridge().getWebView();
                int[] location = new int[2];
                view.getLocationOnScreen(location);
                Rect window = activity.getWindowManager().getCurrentWindowMetrics().getBounds();
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(view);
                assertNotNull("Actual native bounds require window insets", insets);
                TextView body = new TextView(activity), unscaled = new TextView(activity);
                body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
                unscaled.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 16);
                int zoom = view.getSettings().getTextZoom();
                assertEquals("Native text oracle must agree with actual WebView preference", body.getTextSize(),
                    unscaled.getTextSize() * zoom / 100f, unscaled.getTextSize() / 100f);
                result.set(new JSONObject().put("windowPx", rect(window.left, window.top, window.width(), window.height()))
                    .put("webViewPx", rect(location[0], location[1], view.getWidth(), view.getHeight()))
                    .put("systemBarsPx", inset(insets.getInsets(WindowInsetsCompat.Type.systemBars())))
                    .put("cutoutPx", inset(insets.getInsets(WindowInsetsCompat.Type.displayCutout())))
                    .put("imePx", inset(insets.getInsets(WindowInsetsCompat.Type.ime())))
                    .put("imeVisible", insets.isVisible(WindowInsetsCompat.Type.ime()))
                    .put("density", activity.getResources().getDisplayMetrics().density)
                    .put("fontScale", activity.getResources().getConfiguration().fontScale).put("textZoomPercent", zoom)
                    .put("nativeBody16spPx", body.getTextSize()).put("nativeBody16dpPx", unscaled.getTextSize())
                    .put("focused", activity.hasWindowFocus()).put("taskId", activity.getTaskId()));
            } catch (Exception error) { throw new AssertionError("Bounded native geometry observation failed", error); }
        });
        return result.get();
    }

    private void observe(String stage) throws Exception {
        assertTrue("Public N1 trace must remain bounded", trace.length() < 12);
        JSONObject publicState = new JSONObject(web.evaluate("(() => {const r=document.querySelector('.app-shell'),q=" + QUERY
            + ";return {timeOrigin:performance.timeOrigin,viewport:{width:innerWidth,height:innerHeight},root:{classes:r.className,rect:r.getBoundingClientRect().toJSON(),scrollTop:r.scrollTop},query:q?.value,scope:[...document.querySelectorAll('[aria-label=\"History filters\"] button[aria-pressed=\"true\"]')].map(e=>e.textContent.trim()),navigation:[...document.querySelectorAll('nav[aria-label=\"Clipp destinations\"] button')].map(e=>({label:e.textContent.trim(),current:e.getAttribute('aria-current'),rect:e.getBoundingClientRect().toJSON(),font:getComputedStyle(e).fontSize})),cards:" + CARDS
            + ".map(e=>({id:e.dataset.clipId,pinned:e.querySelector('[aria-label=\"Pin Clip\"]')?.getAttribute('aria-pressed')})),focus:document.activeElement?.getAttribute('data-session-focus'),draftLength:document.querySelector('input[aria-label=\"Device Name\"]')?.value.length ?? null,contentCss:{left:document.documentElement.style.getPropertyValue('--clipp-content-left'),top:document.documentElement.style.getPropertyValue('--clipp-content-top'),width:document.documentElement.style.getPropertyValue('--clipp-content-width'),height:document.documentElement.style.getPropertyValue('--clipp-content-height')}}})()"));
        trace.put(new JSONObject().put("stage", stage).put("nativeUptimeMs", SystemClock.uptimeMillis())
            .put("nativeEpochMs", System.currentTimeMillis()).put("native", nativeGeometry()).put("public", publicState));
        emit("stage=" + stage + ";nonce=" + nonce);
    }

    @After
    public void preserveBoundedWitnessAndCloseOnlyOwnedActivity() throws Exception {
        if (directory == null) return;
        List<Throwable> failures = new ArrayList<>();
        boolean cleanupComplete = false;
        if (scenario != null) {
            try { NativePublicWebView.closeScenarioBounded(scenario); cleanupComplete = true; }
            catch (Throwable error) { failures.add(error); }
        }
        try {
            JSONObject receipt = new JSONObject().put("rootNonce", nonce).put("profile", "ordinary-default")
                .put("scope", "N1-only-genuine-ingress-navigation-search-filter-retained-name")
                .put("journeyPassed", journeyPassed).put("activityCleanupComplete", cleanupComplete)
                .put("nativeInput", "unchanged NativePublicWebView guarded DOWN/UP plus Android text/keys")
                .put("ingress", ingress).put("trace", trace).put("copyPerformed", false)
                .put("rootJUnitAndGuestCleanupStillRequired", true);
            byte[] bytes = receipt.toString().getBytes(StandardCharsets.UTF_8);
            assertTrue("Complete N1 public artifact byte cap", bytes.length <= MAX_WITNESS_BYTES);
            File file = new File(directory, "public-witness.json");
            assertTrue("Preserve any existing witness", file.createNewFile());
            try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
            emit("artifact=" + file.getAbsolutePath() + ";bytes=" + bytes.length + ";sha256=" + sha(bytes));
        } catch (Throwable error) { failures.add(error); }
        MultipleFailureException.assertEmpty(failures);
    }

    private String readAsset(String path, int limit) throws Exception {
        try (InputStream input = target.getAssets().open(path); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
                assertTrue("Bounded packaged asset required", output.size() <= limit);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static JSONObject rect(int left, int top, int width, int height) throws Exception {
        return new JSONObject().put("left", left).put("top", top).put("width", width).put("height", height);
    }

    private static JSONObject inset(Insets value) throws Exception {
        return new JSONObject().put("left", value.left).put("top", value.top).put("right", value.right).put("bottom", value.bottom);
    }

    private static String sha(byte[] bytes) throws Exception {
        StringBuilder value = new StringBuilder();
        for (byte item : MessageDigest.getInstance("SHA-256").digest(bytes)) value.append(String.format(java.util.Locale.ROOT, "%02x", item & 0xff));
        return value.toString();
    }

    private void emit(String value) {
        Bundle status = new Bundle();
        status.putString(Instrumentation.REPORT_KEY_STREAMRESULT, "NAV19_MATRIX " + value + "\n");
        instrumentation.sendStatus(0, status);
        Log.i("ClippNavigationMatrix19", value);
    }
}
