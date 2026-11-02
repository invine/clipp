package com.clipp.app;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Process;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
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

/** Two root-assigned phases against an actual normal Electron application.
 * No protocol peer, private Android client, seeded Membership or JS action.
 * Root owns native Electron decisions, same-data process stop/reopen and route
 * identity/provenance/closure; this class never substitutes for those proofs. */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class PairingElectronCounterpartTest {
    private static final String DIALOG = "document.querySelector('[role=dialog][aria-modal=true]')";
    private static final String TEXT = "document.querySelector('textarea[aria-label=\"Pairing text\"]')";
    private static final String UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    @Rule public final TestName testName = new TestName();
    private Context context;
    private ActivityScenario<MainActivity> scenario;
    private NativePublicWebView web;
    private File directory;
    private String nonce, phase, electronPeer, target, selfPeer, androidMarker, electronMarker;
    private long deadline, wallDeadline;
    private boolean passed;
    private final JSONObject observations = new JSONObject();

    @Before
    public void requireExplicitRootAndOrdinaryPackagedApplication() throws Exception {
        context = instrumentation.getTargetContext();
        NativeAcceptanceTarget.requireIsolated(context.getPackageName());
        Bundle args = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("Explicit isolated native counterpart interval only",
            "true".equals(args.getString("pairingElectronAcceptance")));
        nonce = args.getString("pairingRootNonce", "");
        phase = args.getString("pairingElectronPhase", "");
        electronPeer = args.getString("pairingElectronPeerId", "");
        target = args.getString("pairingElectronTarget", "");
        assertTrue("Fresh fixed case nonce", nonce.matches("g01_[0-9a-f]{32}"));
        assertTrue("Actual Electron public Peer ID", electronPeer.matches("[A-Za-z0-9]{32,128}"));
        assertTrue("One phase only", phase.equals("pair") || phase.equals("reopen-exchange"));
        assertEquals("Only the assigned native method", phase.equals("pair")
            ? "requestRejectAndFreshAcceptThroughRealElectron" : "coldReopenRetainsMembershipAndExchangesNativeMarkers", testName.getMethodName());
        String rawDeadline = args.getString("pairingJourneyDeadlineUnixMs", "");
        assertTrue("Root supplies a finite original phase deadline", rawDeadline.matches("[1-9][0-9]{0,15}"));
        wallDeadline = Long.parseLong(rawDeadline);
        long remaining = wallDeadline - System.currentTimeMillis();
        assertTrue("No native phase exceeds150s", remaining > 0 && remaining <= 150000);
        deadline = SystemClock.uptimeMillis() + remaining;
        androidMarker = "clipp-g01-" + nonce + "-android-to-electron";
        electronMarker = "clipp-g01-" + nonce + "-electron-to-android";
        directory = new File(context.getCacheDir(), "pairing10-" + nonce);
        if (phase.equals("pair")) assertTrue("Fresh exclusive case directory", directory.mkdir());
        else assertTrue("Retained same-data case directory required", directory.isDirectory());
        check(); JSONObject config = new JSONObject(new String(readAsset("capacitor.config.json"), StandardCharsets.UTF_8)); check();
        JSONObject server = config.optJSONObject("server");
        assertTrue("Ordinary packaged app, no dev server", server == null || !server.has("url"));
        check(); scenario = ActivityScenario.launch(MainActivity.class); check();
        web = new NativePublicWebView(instrumentation, scenario);
        await("normal workspace", "!!document.querySelector('nav[aria-label=\"Clipp destinations\"]')");
        assertEquals("Normal HTTPS packaged origin", "https://localhost/", evaluate("location.origin + '/'"));
        destination("Devices");
        await("full public local Peer ID", "!!document.querySelector('.peer-item.active .peer-sub[title]')");
        selfPeer = evaluate("document.querySelector('.peer-item.active .peer-sub[title]').getAttribute('title')");
        assertTrue("Actual public Android identity", selfPeer.matches("[A-Za-z0-9]{32,128}"));
        assertNotEquals("Independent actual applications", electronPeer, selfPeer);
        observations.put("androidPeerId", selfPeer).put("electronPeerId", electronPeer)
            .put("pid", Process.myPid()).put("processStartUptimeMs", Process.getStartUptimeMillis());
        emit("android-ready");
    }

    @Test
    public void requestRejectAndFreshAcceptThroughRealElectron() throws Exception {
        assertTrue("Actual public QR-copy payload required", target.startsWith("clipp:pair:") && target.length() <= 65536);
        assertEquals("Fresh singleton Devices", "0", evaluate(remoteCards() + ".length"));
        openPaste(); replaceText(TEXT, target); submitAndRetain();
        destination("Requests");
        await("current outgoing waiting", outcomeContains("Waiting for approval."));
        emit("request-waiting-root-electron-reject-required");
        await("validated rejection, no Membership", outcomeContains("Rejection response received.") + "&&"
            + outcomeContains("Current membership has not confirmed this device.") + "&&!" + outcomeContains("Retrying local membership storage automatically."));
        observations.put("validatedRejectionObserved", true);
        openPaste();
        String dirty = "  newer unsubmitted " + nonce + "  ";
        // Create the newer raw draft BEFORE dismissing the terminal notice.
        replaceText(TEXT, dirty); backAndClosePairing();
        destination("Requests");
        await("rejection notice still current", outcomeContains("Rejection response received."));
        tapButton("Dismiss notice for " + electronPeer);
        await("dismissed terminal notice", "!(" + outcomeCard() + ")");
        openPaste();
        assertEquals("Unsubmitted whitespace-bearing draft retained", dirty, evaluate("(" + TEXT + ").value"));
        observations.put("dismissalAndNewerDraftRetained", true);
        replaceText(TEXT, target); submitAndRetain();
        destination("Requests");
        await("fresh current waiting", outcomeContains("Waiting for approval."));
        emit("fresh-request-waiting-root-electron-accept-required");
        await("validated acceptance and authoritative Membership", outcomeContains("Acceptance response received.") + "&&"
            + outcomeContains("Currently paired.") + "&&!" + outcomeContains("Retrying local membership storage automatically.") + "&&!" + outcomeContains("Waiting for approval."));
        destination("Devices"); assertSoleCounterpart();
        observations.put("validatedAcceptanceAndAndroidMemberObserved", true);
        emit("pairing-complete-root-reciprocal-durable-membership-and-cold-stop-required");
        check(); passed = true;
    }

    @Test
    public void coldReopenRetainsMembershipAndExchangesNativeMarkers() throws Exception {
        String expectedSha = InstrumentationRegistry.getArguments().getString("pairingPhaseASha256", "");
        assertTrue("Root binds the completed first phase", expectedSha.matches("[0-9a-f]{64}"));
        byte[] firstBytes = readBounded(new File(directory, "phase-a.json"), 8192);
        assertEquals("Immutable actual phase A", expectedSha, sha(firstBytes));
        JSONObject first = new JSONObject(new String(firstBytes, StandardCharsets.UTF_8));
        assertTrue("Phase A completed and Activity closed", first.getBoolean("selectedPhasePassed") && first.getBoolean("activityClosed"));
        JSONObject prior = first.getJSONObject("observations");
        assertEquals("Same persisted Android Peer ID", prior.getString("androidPeerId"), selfPeer);
        assertEquals("Same Electron counterpart", prior.getString("electronPeerId"), electronPeer);
        assertTrue("Actually new Android process lifetime", prior.getInt("pid") != Process.myPid()
            || prior.getLong("processStartUptimeMs") != Process.getStartUptimeMillis());
        assertSoleCounterpart();
        observations.put("phaseASha256", expectedSha).put("phaseAPid", prior.getInt("pid"))
            .put("phaseAProcessStartUptimeMs", prior.getLong("processStartUptimeMs"))
            .put("samePeerAndAndroidMemberAfterNewProcess", true);
        destination("History");
        await("ordinary All History", "!!(" + web.button("All") + ")"); tapButton("All");
        await("fresh markers absent", matching(androidMarker) + ".length===0&&" + matching(electronMarker) + ".length===0");
        JSONArray before = new JSONArray(evaluate("[...document.querySelectorAll('.history-card[data-clip-id]')].map(e=>e.getAttribute('data-clip-id'))"));
        assertTrue("Bounded initial public History", before.length() <= 32);
        setAutoSync(false); destination("History");
        ClipboardManager clipboard = context.getSystemService(ClipboardManager.class);
        check(); web.onActivity(activity -> clipboard.setPrimaryClip(ClipData.newPlainText("Clipp G01 " + nonce, androidMarker))); check();
        String sentId = awaitClip(androidMarker, "Local");
        assertFalse("New native Local Clip ID", contains(before, sentId));
        assertClipOrigin(sentId, selfPeer);
        tapButton("Share current clipboard now");
        observations.put("androidToElectronClipId", sentId).put("androidNativeClipboardWriteAndPublicShare", true);
        emit("android-marker-shared-root-electron-remote-and-memory-port-proof-required");
        setAutoSync(true); destination("History");
        emit("awaiting-root-electron-paused-auto-sync-marker-and-public-share");
        String receivedId = awaitClip(electronMarker, "Remote");
        assertFalse("New received Clip ID", contains(before, receivedId)); assertNotEquals(sentId, receivedId);
        assertClipOrigin(receivedId, electronPeer);
        long end = Math.min(deadline, SystemClock.uptimeMillis() + 20000);
        boolean applied = false;
        do {
            checkUntil(end);
            ClipData current = clipboard.getPrimaryClip();
            CharSequence value = current != null && current.getItemCount() == 1 ? current.getItemAt(0).getText() : null;
            applied = value != null && electronMarker.contentEquals(value);
            checkUntil(end);
            if (applied) break;
            SystemClock.sleep(50);
        } while (SystemClock.uptimeMillis() < end);
        assertTrue("Actual guest native clipboard received the known Electron marker", applied);
        observations.put("electronToAndroidClipId", receivedId).put("electronOriginAndNativeClipboardApplied", true);
        destination("Devices"); assertSoleCounterpart();
        emit("both-public-clip-directions-observed-root-native-route-and-closure-still-required");
        check(); passed = true;
    }

    private void assertSoleCounterpart() throws Exception {
        await("one actual current Member in Devices", remoteCards() + ".length===1&&" + remoteCards()
            + "[0].querySelector('.peer-sub[title]')?.getAttribute('title')===" + JSONObject.quote(electronPeer));
        assertEquals(selfPeer, evaluate("document.querySelector('.peer-item.active .peer-sub[title]').getAttribute('title')"));
    }
    private String remoteCards() { return "[...document.querySelectorAll('.peer-item:not(.active)')]"; }
    private String outcomeCard() { return "document.querySelector('[data-pairing-target=" + JSONObject.quote(electronPeer) + "]')"; }
    private String outcomeContains(String text) { return "(!!(" + outcomeCard() + ")&&(" + outcomeCard() + ").textContent.includes(" + JSONObject.quote(text) + "))"; }
    private void destination(String name) throws Exception { tapButton(name); }
    private void openPaste() throws Exception { destination("Devices"); tapButton("Pair this device"); tapButton("Paste pairing text"); await("Paste task", "!!(" + TEXT + ")"); }
    private void backAndClosePairing() throws Exception { tapButton("Back to Pairing"); tapButton("Close Pairing"); await("no task", "!(" + DIALOG + ")"); }
    private void submitAndRetain() throws Exception { tapButton("Submit pairing text"); await("signed request sent", "[...document.querySelectorAll('[role=status]')].some(e=>e.textContent==='Request submitted. Waiting for approval.')"); backAndClosePairing(); }
    private void replaceText(String element, String value) throws Exception {
        tap(element); check(); long down = SystemClock.uptimeMillis();
        for (int action : new int[]{KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP}) {
            KeyEvent event = new KeyEvent(down, SystemClock.uptimeMillis(), action, KeyEvent.KEYCODE_A, 0, KeyEvent.META_CTRL_ON);
            event.setSource(InputDevice.SOURCE_KEYBOARD); instrumentation.sendKeySync(event);
        }
        check(); instrumentation.sendStringSync(value); check();
        await("actual typed public raw input", "(" + element + ").value===" + JSONObject.quote(value));
    }
    private String matching(String text) { return "[...document.querySelectorAll('.history-card[data-clip-id]')].filter(e=>e.getClientRects().length&&e.querySelector('.history-text')?.textContent===" + JSONObject.quote(text) + ")"; }
    private String awaitClip(String marker, String kind) throws Exception {
        await("one new known " + kind + " Clip", matching(marker) + ".length===1&&" + matching(marker) + "[0].querySelector('.pill-source')?.textContent.trim()===" + JSONObject.quote(kind));
        String id = evaluate(matching(marker) + "[0].getAttribute('data-clip-id')"); assertTrue("Canonical public Clip ID", id.matches(UUID)); return id;
    }
    private void assertClipOrigin(String id, String origin) throws Exception {
        String card = "document.querySelector('.history-card[data-clip-id=" + JSONObject.quote(id) + "]')";
        tap("(" + card + ").querySelector('button[aria-label=\"More Clip actions\"]')");
        tapButton("View Clip details"); await("ordinary Clip details", "!!document.querySelector('.clip-details')");
        assertEquals(id, detail("Clip ID")); assertEquals(origin, detail("Source Peer ID")); tapButton("Back to History");
    }
    private String detail(String label) throws Exception { return evaluate("[...document.querySelectorAll('.clip-details dt')].find(e=>e.textContent===" + JSONObject.quote(label) + ").nextElementSibling.textContent"); }
    private boolean contains(JSONArray values, String value) throws Exception { for (int i = 0; i < values.length(); i++) if (value.equals(values.getString(i))) return true; return false; }

    private void setAutoSync(boolean enabled) throws Exception {
        destination("Settings");
        String select = "document.querySelector('#auto-sync')", value = enabled ? "enabled" : "disabled";
        await("normal editable Auto Sync", "!!(" + select + ")&&!(" + select + ").disabled&&(" + select + ").getAttribute('aria-busy')!=='true'");
        if (!value.equals(evaluate("(" + select + ").value"))) {
            tap(select);
            String label = enabled ? "Enabled" : "Disabled — keep Clips local";
            AccessibilityNodeInfo root = null;
            List<AccessibilityNodeInfo> results = null;
            try {
                check(); root = instrumentation.getUiAutomation().getRootInActiveWindow(); check();
                assertNotNull("Actual owned native select", root);
                assertEquals(context.getPackageName(), String.valueOf(root.getPackageName()));
                results = root.findAccessibilityNodeInfosByText(label); check();
                assertNotNull(results); assertTrue("Bounded known-option query", results.size() <= 4);
                AccessibilityNodeInfo chosen = null;
                for (AccessibilityNodeInfo option : results) {
                    if (option == null) continue;
                    CharSequence text = option.getText();
                    if (text != null && option.isVisibleToUser() && option.isEnabled()
                            && context.getPackageName().equals(String.valueOf(option.getPackageName()))
                            && "android.widget.CheckedTextView".equals(String.valueOf(option.getClassName())) && label.contentEquals(text)) {
                        assertNull("One exact native option", chosen); chosen = option;
                    }
                }
                assertNotNull("Exact public native option", chosen); Rect bounds = new Rect(); chosen.getBoundsInScreen(bounds); assertFalse(bounds.isEmpty()); check();
                tapNativeOption(bounds);
            } finally {
                IdentityHashMap<AccessibilityNodeInfo, Boolean> recycled = new IdentityHashMap<>();
                List<Throwable> cleanup = new ArrayList<>();
                if (results != null) for (AccessibilityNodeInfo node : results) recycle(node, recycled, cleanup);
                recycle(root, recycled, cleanup);
                MultipleFailureException.assertEmpty(cleanup);
            }
        }
        await("Auto Sync applied through normal control", "(" + select + ")?.value===" + JSONObject.quote(value) + "&&(" + select + ").getAttribute('aria-busy')!=='true'");
    }
    private void recycle(AccessibilityNodeInfo node, IdentityHashMap<AccessibilityNodeInfo, Boolean> seen, List<Throwable> failures) {
        if (node != null && seen.put(node, true) == null) try { node.recycle(); } catch (Throwable error) { failures.add(error); }
    }
    private void tapNativeOption(Rect bounds) {
        check(); long downTime = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, bounds.exactCenterX(), bounds.exactCenterY(), 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            try { assertTrue("Actual Android option DOWN accepted", instrumentation.getUiAutomation().injectInputEvent(down, true)); SystemClock.sleep(40); check(); }
            finally {
                // Matching UP retires the attempted DOWN even if the journey
                // deadline expires; it cannot make a late journey qualify.
                MotionEvent up = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, bounds.exactCenterX(), bounds.exactCenterY(), 0);
                up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
                try { assertTrue("Actual Android option UP accepted", instrumentation.getUiAutomation().injectInputEvent(up, true)); }
                finally { up.recycle(); }
            }
        } finally { down.recycle(); } check();
    }
    private void tapButton(String name) throws Exception { tap(web.button(name)); }
    private void tap(String element) throws Exception { check(); web.tap(element); check(); }
    private String evaluate(String expression) throws Exception { check(); String result = web.evaluate(expression); check(); return result; }
    private void await(String description, String expression) throws Exception {
        long end = Math.min(deadline, SystemClock.uptimeMillis() + 20000);
        do { checkUntil(end); boolean ready = "true".equals(evaluate(expression)); checkUntil(end); if (ready) return; SystemClock.sleep(50); } while (SystemClock.uptimeMillis() < end);
        throw new AssertionError("Public condition unmet: " + description);
    }
    private void check() { assertTrue("Original finite150s phase", SystemClock.uptimeMillis() < deadline && System.currentTimeMillis() < wallDeadline); }
    private void checkUntil(long end) { check(); assertTrue("Original finite20s observation", SystemClock.uptimeMillis() < end); }
    private void emit(String stage) throws Exception {
        check(); Bundle status = new Bundle(); status.putString(Instrumentation.REPORT_KEY_STREAMRESULT,
            "PAIRING10 nonce=" + nonce + ";phase=" + phase + ";stage=" + stage + ";peerId=" + selfPeer + ";pid=" + Process.myPid() + "\n"); instrumentation.sendStatus(0, status); check();
    }
    private byte[] readAsset(String name) throws Exception { try (InputStream input = context.getAssets().open(name)) { return bounded(input, 32768); } }
    private byte[] readBounded(File path, int cap) throws Exception { try (InputStream input = Files.newInputStream(path.toPath())) { return bounded(input, cap); } }
    private byte[] bounded(InputStream input, int cap) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] block = new byte[4096]; int count;
        check();
        while ((count = input.read(block)) != -1) { check(); bytes.write(block, 0, count); assertTrue("Bounded actual evidence", bytes.size() <= cap); check(); }
        check(); return bytes.toByteArray();
    }
    private static String sha(byte[] bytes) throws Exception { StringBuilder value = new StringBuilder(); for (byte item : MessageDigest.getInstance("SHA-256").digest(bytes)) value.append(String.format(java.util.Locale.ROOT, "%02x", item & 255)); return value.toString(); }

    @After
    public void preserveBoundedPublicWitnessAndCloseOnlyOwnedActivity() throws Exception {
        if (directory == null) return;
        List<Throwable> errors = new ArrayList<>(); boolean closed = false;
        try { if (scenario != null) { NativePublicWebView.closeScenarioBounded(scenario); closed = true; } } catch (Throwable error) { errors.add(error); }
        try {
            boolean timely = SystemClock.uptimeMillis() < deadline && System.currentTimeMillis() < wallDeadline;
            JSONObject witness = new JSONObject().put("nonce", nonce).put("phase", phase).put("selectedPhasePassed", passed && timely)
                .put("activityClosed", closed).put("observations", observations).put("nativePeerRouteAndRootProcessClosureStillRequired", true)
                .put("wholeTicket10Qualified", false).put("hostClipboardUsed", false);
            byte[] bytes = witness.toString().getBytes(StandardCharsets.UTF_8); assertTrue("Bounded public witness", bytes.length <= 8192);
            File output = new File(directory, phase.equals("pair") ? "phase-a.json" : "phase-b.json"); assertTrue("Exclusive witness", output.createNewFile());
            try (FileOutputStream stream = new FileOutputStream(output)) { stream.write(bytes); }
            check(); Bundle status = new Bundle(); status.putString(Instrumentation.REPORT_KEY_STREAMRESULT,
                "PAIRING10 nonce=" + nonce + ";phase=" + phase + ";artifact=" + output.getAbsolutePath() + ";bytes=" + bytes.length + ";sha256=" + sha(bytes) + "\n"); instrumentation.sendStatus(0, status); check();
        } catch (Throwable error) { errors.add(error); }
        MultipleFailureException.assertEmpty(errors);
    }
}
