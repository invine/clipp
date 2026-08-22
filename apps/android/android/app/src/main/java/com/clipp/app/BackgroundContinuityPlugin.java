package com.clipp.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundContinuity")
public final class BackgroundContinuityPlugin extends Plugin {
    private static final long SERVICE_START_TIMEOUT_MS = 10_000L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private PluginCall pendingStartCall;
    private final Runnable serviceStartTimeout = () -> {
        PluginCall call = takePendingStartCall();
        if (call != null) call.reject("background_continuity_start_timeout");
    };

    private final BroadcastReceiver eventReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (BackgroundContinuityService.ACTION_SERVICE_STARTED.equals(intent.getAction())) {
                PluginCall call = takePendingStartCall();
                if (call != null) call.resolve();
                return;
            }
            if (BackgroundContinuityService.ACTION_RUNTIME_LOST.equals(intent.getAction())) {
                notifyListeners("runtimeLost", new JSObject());
                return;
            }
            if (BackgroundContinuityService.ACTION_TASK_REMOVED.equals(intent.getAction())) {
                notifyListeners("taskRemoved", new JSObject());
                return;
            }
            if (BackgroundContinuityService.ACTION_NOTIFICATION_ACTION.equals(intent.getAction())) {
                JSObject event = new JSObject();
                event.put("action", intent.getStringExtra(BackgroundContinuityService.EXTRA_ACTION));
                notifyListeners("action", event, true);
                return;
            }
            if (ExplicitTextIngressStore.ACTION_EXPLICIT_TEXT_QUEUED.equals(intent.getAction())) {
                notifyListeners("explicitText", new JSObject(), true);
            }
        }
    };

    @Override
    public void load() {
        IntentFilter filter = new IntentFilter();
        filter.addAction(BackgroundContinuityService.ACTION_RUNTIME_LOST);
        filter.addAction(BackgroundContinuityService.ACTION_TASK_REMOVED);
        filter.addAction(BackgroundContinuityService.ACTION_NOTIFICATION_ACTION);
        filter.addAction(BackgroundContinuityService.ACTION_SERVICE_STARTED);
        filter.addAction(ExplicitTextIngressStore.ACTION_EXPLICIT_TEXT_QUEUED);
        ContextCompat.registerReceiver(getContext(), eventReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void handleOnResume() {
        notifyActivityState(true);
    }

    @Override
    protected void handleOnPause() {
        notifyActivityState(false);
    }

    @Override
    protected void handleOnDestroy() {
        PluginCall startCall = takePendingStartCall();
        if (startCall != null) startCall.reject("background_continuity_plugin_destroyed");
        try {
            getContext().unregisterReceiver(eventReceiver);
        } catch (IllegalArgumentException ignored) {
            // The bridge can destroy an unloaded plugin during process teardown.
        }
    }

    @PluginMethod
    public void getPlatformInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("apiLevel", Build.VERSION.SDK_INT);
        result.put("userStopped", BackgroundContinuityService.preferences(getContext()).getBoolean(BackgroundContinuityService.USER_STOPPED, false));
        result.put(
            "notificationPermission",
            BackgroundContinuityService.notificationsGranted(getContext()) ? "granted" : "denied"
        );
        call.resolve(result);
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        BackgroundContinuityService.preferences(getContext()).edit()
            .putBoolean(BackgroundContinuityService.ENABLED, enabled)
            .putBoolean(BackgroundContinuityService.USER_STOPPED, !enabled)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT < 36) {
            call.reject("background_continuity_unavailable");
            return;
        }
        if (!BackgroundContinuityService.preferences(getContext()).getBoolean(BackgroundContinuityService.ENABLED, false)) {
            call.reject("background_continuity_not_enabled");
            return;
        }
        if (pendingStartCall != null) {
            call.reject("background_continuity_start_in_progress");
            return;
        }
        pendingStartCall = call;
        handler.postDelayed(serviceStartTimeout, SERVICE_START_TIMEOUT_MS);
        try {
            Intent intent = new Intent(getContext(), BackgroundContinuityService.class).setAction(BackgroundContinuityService.ACTION_START);
            ContextCompat.startForegroundService(getContext(), intent);
        } catch (RuntimeException error) {
            PluginCall startCall = takePendingStartCall();
            if (startCall != null) startCall.reject("background_continuity_start_failed", error);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), BackgroundContinuityService.class));
        call.resolve();
    }

    @PluginMethod
    public void heartbeat(PluginCall call) {
        getContext().startService(new Intent(getContext(), BackgroundContinuityService.class).setAction(BackgroundContinuityService.ACTION_HEARTBEAT));
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        Intent intent = new Intent(getContext(), BackgroundContinuityService.class).setAction(BackgroundContinuityService.ACTION_UPDATE);
        intent.putExtra(BackgroundContinuityService.EXTRA_CONNECTION_STATE, call.getString("state", "waiting"));
        intent.putExtra(BackgroundContinuityService.EXTRA_CONNECTED_DEVICE_COUNT, call.getInt("connectedTrustedDeviceCount", 0));
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void showReconnectNotification(PluginCall call) {
        BackgroundContinuityService.postReconnectNotification(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getExplicitTextActions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("actions", new ExplicitTextIngressStore(getContext()).actionsJson());
        call.resolve(result);
    }

    @PluginMethod
    public void prepareExplicitTextAction(PluginCall call) {
        String actionId = call.getString("actionId");
        String clipId = call.getString("clipId");
        Long capturedAt = call.getLong("capturedAt");
        if (actionId == null || clipId == null || capturedAt == null) {
            call.reject("invalid_explicit_text_action");
            return;
        }
        if (!new ExplicitTextIngressStore(getContext()).prepare(actionId, clipId, capturedAt)) {
            call.reject("explicit_text_action_persistence_failed");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void completeExplicitTextAction(PluginCall call) {
        String actionId = call.getString("actionId");
        if (actionId == null || !new ExplicitTextIngressStore(getContext()).complete(actionId)) {
            call.reject("explicit_text_action_completion_failed");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void showExplicitTextFeedback(PluginCall call) {
        String state = call.getString("state", "failed");
        int message = "accepted".equals(state)
            ? R.string.explicit_text_accepted
            : ("queued".equals(state) ? R.string.explicit_text_queued : R.string.explicit_text_failed);
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), message, Toast.LENGTH_SHORT).show());
        call.resolve();
    }

    @PluginMethod
    public void getPendingClipboardApplication(PluginCall call) {
        JSObject result = new JSObject();
        result.put("clipId", new PendingClipboardApplicationStore(getContext()).read());
        call.resolve(result);
    }

    @PluginMethod
    public void setPendingClipboardApplication(PluginCall call) {
        String clipId = call.getString("clipId");
        if (clipId == null || !new PendingClipboardApplicationStore(getContext()).write(clipId)) {
            call.reject("pending_clipboard_application_persistence_failed");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void clearPendingClipboardApplication(PluginCall call) {
        if (!new PendingClipboardApplicationStore(getContext()).clear()) {
            call.reject("pending_clipboard_application_clear_failed");
            return;
        }
        call.resolve();
    }

    private void notifyActivityState(boolean resumed) {
        JSObject event = new JSObject();
        event.put("resumed", resumed);
        event.put("windowFocused", resumed && getActivity() != null && getActivity().getWindow().getDecorView().hasWindowFocus());
        notifyListeners("activityState", event, true);
    }

    private PluginCall takePendingStartCall() {
        handler.removeCallbacks(serviceStartTimeout);
        PluginCall call = pendingStartCall;
        pendingStartCall = null;
        return call;
    }
}
