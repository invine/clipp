package com.clipp.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundContinuity")
public final class BackgroundContinuityPlugin extends Plugin {
    private final BroadcastReceiver eventReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (BackgroundContinuityService.ACTION_RUNTIME_LOST.equals(intent.getAction())) {
                notifyListeners("runtimeLost", new JSObject());
                return;
            }
            if (BackgroundContinuityService.ACTION_NOTIFICATION_ACTION.equals(intent.getAction())) {
                JSObject event = new JSObject();
                event.put("action", intent.getStringExtra(BackgroundContinuityService.EXTRA_ACTION));
                notifyListeners("action", event, true);
            }
        }
    };

    @Override
    public void load() {
        IntentFilter filter = new IntentFilter();
        filter.addAction(BackgroundContinuityService.ACTION_RUNTIME_LOST);
        filter.addAction(BackgroundContinuityService.ACTION_NOTIFICATION_ACTION);
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
            call.resolve();
            return;
        }
        Intent intent = new Intent(getContext(), BackgroundContinuityService.class).setAction(BackgroundContinuityService.ACTION_START);
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
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

    private void notifyActivityState(boolean resumed) {
        JSObject event = new JSObject();
        event.put("resumed", resumed);
        event.put("windowFocused", resumed && getActivity() != null && getActivity().getWindow().getDecorView().hasWindowFocus());
        notifyListeners("activityState", event, true);
    }
}
