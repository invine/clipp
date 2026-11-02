package com.clipp.app;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.MessageHandler;
import com.getcapacitor.PluginCall;

/** Source fixture: actual plugin and installed Capacitor call/object classes;
 * external platform/container stubs, no JSON parser or Android/native UI proof. */
public final class HostTaskInputBoundary {
    private static void require(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
    private static PluginCall call(JSObject data) {
        return new PluginCall(new MessageHandler(), "HostTaskInput", "source", "source", data);
    }
    private static HostTaskInputPlugin ready() {
        ViewCompat.insets = new WindowInsetsCompat();
        HostTaskInputPlugin plugin = new HostTaskInputPlugin();
        plugin.load();
        plugin.setReady(call(new JSObject().put("owner", "document").put("ready", true)));
        return plugin;
    }
    private static void back(HostTaskInputPlugin plugin) {
        plugin.getActivity().getOnBackPressedDispatcher().onBackPressed();
    }
    private static void acknowledgeSmallInteger() {
        HostTaskInputPlugin plugin = ready();
        back(plugin);
        require(plugin.events.size() == 1, "first Back must reach the live owner");
        JSObject ack = new JSObject().put("owner", "document").put("sequence", 1).put("handled", true);
        require(ack.opt("sequence") instanceof Integer, "real JSObject.put(int) must retain Integer wire representation");
        plugin.completeBack(call(ack));
        back(plugin);
        require(plugin.events.size() == 2, "acknowledged small JSON integer must release pending Back for the next event");
        require(((Number)plugin.events.get(1).opt("sequence")).longValue() == 2, "next Back must have a new sequence");
        require(plugin.getActivity().getOnBackPressedDispatcher().rootDelegations == 0, "handled task Back cannot leave the root");
    }
    private static void ack(HostTaskInputPlugin plugin, String owner, Object sequence, boolean handled) {
        plugin.completeBack(call(new JSObject().put("owner", owner).put("sequence", sequence).put("handled", handled)));
    }
    private static int roots(HostTaskInputPlugin plugin) {
        return plugin.getActivity().getOnBackPressedDispatcher().rootDelegations;
    }
    private static void numericRepresentations() {
        for (Object value : new Object[] {Long.valueOf(1), Double.valueOf(1), Float.valueOf(1)}) {
            HostTaskInputPlugin plugin = ready();
            back(plugin);
            ack(plugin, "document", value, true);
            back(plugin);
            require(plugin.events.size() == 2, "integral Number acknowledgement must release the next Back: " + value.getClass());
        }
    }
    private static void invalidAcknowledgements() {
        Object[] invalid = {null, "1", true, new JSObject(), 0, -1, 1.25, Double.NaN,
            Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, 9_007_199_254_740_992L, Long.MAX_VALUE};
        for (Object value : invalid) {
            HostTaskInputPlugin plugin = ready();
            back(plugin);
            ack(plugin, "document", value, false);
            back(plugin);
            require(plugin.events.size() == 1 && roots(plugin) == 0, "invalid acknowledgement cannot clear pending or delegate: " + value);
            ack(plugin, "document", 1, true);
            back(plugin);
            require(plugin.events.size() == 2, "valid acknowledgement must recover after invalid input");
        }
    }
    private static void exactOwnerAndSequence() {
        HostTaskInputPlugin plugin = ready();
        back(plugin);
        back(plugin);
        require(plugin.events.size() == 1, "a pending event must consume repeated Back");
        ack(plugin, "foreign", 1, false);
        ack(plugin, "document", 2, false);
        back(plugin);
        require(plugin.events.size() == 1 && roots(plugin) == 0, "only the exact live owner/sequence can acknowledge");
        ack(plugin, "document", 1, true);
        back(plugin);
        ack(plugin, "document", 1, false);
        back(plugin);
        require(plugin.events.size() == 2 && roots(plugin) == 0, "late acknowledgement cannot clear the next pending event");
        ack(plugin, "document", 2, true);
        back(plugin);
        require(plugin.events.size() == 3, "the exact next acknowledgement must still work");
    }
    private static void confirmedRootAndFocus() {
        HostTaskInputPlugin plugin = ready();
        back(plugin);
        ack(plugin, "document", 1, false);
        require(roots(plugin) == 1, "a confirmed unhandled root must delegate exactly once");
        ack(plugin, "document", 1, false);
        require(roots(plugin) == 1, "duplicate acknowledgement cannot delegate again");
        back(plugin);
        require(plugin.events.size() == 2, "callback must be restored after root delegation");
        plugin.getActivity().focused = false;
        ack(plugin, "document", 2, false);
        require(roots(plugin) == 1, "unfocused activity cannot delegate to root");
        back(plugin);
        require(plugin.events.size() == 2, "unfocused activity cannot dispatch a task event");
        plugin.getActivity().focused = true;
        back(plugin);
        require(plugin.events.size() == 3, "focused activity resumes after acknowledgement");
    }
    private static void staleQueuedOwnerAndDisposal() {
        HostTaskInputPlugin plugin = ready();
        back(plugin);
        plugin.getActivity().defer = true;
        ack(plugin, "document", 1, false);
        plugin.getActivity().defer = false;
        plugin.setReady(call(new JSObject().put("owner", "replacement").put("ready", true)));
        back(plugin);
        plugin.getActivity().flush();
        back(plugin);
        require(plugin.events.size() == 2 && roots(plugin) == 0, "queued old-owner acknowledgement cannot clear a replacement event");
        ack(plugin, "replacement", 2, true);
        back(plugin);
        require(plugin.events.size() == 3, "replacement owner can acknowledge its own event");

        HostTaskInputPlugin disposed = ready();
        back(disposed);
        disposed.getActivity().defer = true;
        ack(disposed, "document", 1, false);
        disposed.destroyFromPlatform();
        disposed.getActivity().flush();
        require(roots(disposed) == 0 && disposed.events.size() == 1, "queued acknowledgement after disposal cannot delegate or dispatch");
    }
    private static void unavailableAndIme() {
        HostTaskInputPlugin plugin = ready();
        ViewCompat.insets.visible = true;
        back(plugin);
        require(!ViewCompat.insets.visible && plugin.events.isEmpty(), "IME Back must hide input before any task event");
        back(plugin);
        plugin.setReady(call(new JSObject().put("owner", "document").put("ready", false)));
        ack(plugin, "document", 1, false);
        back(plugin);
        require(plugin.events.size() == 1 && roots(plugin) == 0, "unavailable owner consumes Back without unconfirmed root delegation");
        plugin.setReady(call(new JSObject().put("owner", "document").put("ready", true)));
        back(plugin);
        require(plugin.events.size() == 2, "live owner can resume after retirement");
    }
    public static void main(String[] args) {
        acknowledgeSmallInteger();
        numericRepresentations();
        invalidAcknowledgements();
        exactOwnerAndSequence();
        confirmedRootAndFocus();
        staleQueuedOwnerAndDisposal();
        unavailableAndIme();
        System.out.println("PASS 7 actual-plugin boundary scenarios, including 12 invalid numeric/type cases");
    }
}
