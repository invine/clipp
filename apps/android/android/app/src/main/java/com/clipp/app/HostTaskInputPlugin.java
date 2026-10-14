package com.clipp.app;

import android.view.View;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Native input owns IME dismissal and one outstanding Back. Only the live UI owner
 * decides whether a task/overlay handled it. Missing/late replies never exit the app. */
@CapacitorPlugin(name = "HostTaskInput")
public final class HostTaskInputPlugin extends Plugin {
    private String owner;
    private long sequence;
    private long pending;
    private boolean destroyed;
    private OnBackPressedCallback back;

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> {
            if (destroyed) return;
            // Interception exists before async JS readiness and remains after disposal.
            back = new OnBackPressedCallback(true) {
                @Override public void handleOnBackPressed() {
                    if (pending != 0 || !getActivity().hasWindowFocus()) return; // Held/repeated input cannot dismiss another level.
                    View view = getBridge().getWebView();
                    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(view);
                    if (insets == null) return; // Never infer a hidden keyboard from unavailable native insets.
                    if (insets.isVisible(WindowInsetsCompat.Type.ime())) {
                        new WindowInsetsControllerCompat(getActivity().getWindow(), view)
                            .hide(WindowInsetsCompat.Type.ime());
                        return;
                    }
                    if (owner == null) return; // Consume while no live listener can confirm task/root handling.
                    pending = ++sequence;
                    JSObject event = new JSObject();
                    event.put("owner", owner);
                    event.put("sequence", pending);
                    event.put("imeVisible", false);
                    notifyListeners("back", event);
                }
            };
            getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), back);
        });
    }

    @PluginMethod
    public void setReady(PluginCall call) {
        String requestedOwner = call.getString("owner");
        boolean ready = Boolean.TRUE.equals(call.getBoolean("ready"));
        getActivity().runOnUiThread(() -> {
            if (destroyed || back == null || requestedOwner == null) { call.reject("host_input_unavailable"); return; }
            if (ready) { owner = requestedOwner; pending = 0; back.setEnabled(true); }
            else if (requestedOwner.equals(owner)) { owner = null; pending = 0; }
            call.resolve();
        });
    }

    @PluginMethod
    public void completeBack(PluginCall call) {
        String requestedOwner = call.getString("owner");
        Long requestedSequence = call.getLong("sequence");
        boolean handled = Boolean.TRUE.equals(call.getBoolean("handled"));
        getActivity().runOnUiThread(() -> {
            if (!destroyed && owner != null && owner.equals(requestedOwner)
                && requestedSequence != null && requestedSequence == pending && pending != 0) {
                pending = 0;
                if (!handled && getActivity().hasWindowFocus()) {
                    // Delegate only a confirmed root event; no browser-history task routing.
                    back.setEnabled(false);
                    try { getActivity().getOnBackPressedDispatcher().onBackPressed(); }
                    finally { if (!destroyed) back.setEnabled(true); }
                }
            }
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        owner = null;
        pending = 0;
        if (back != null) back.remove();
    }
}
