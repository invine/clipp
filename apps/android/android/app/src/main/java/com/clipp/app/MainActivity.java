package com.clipp.app;

import android.os.Bundle;
import android.content.res.Configuration;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.webkit.WebSettings;
import android.content.Intent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static volatile boolean activityOwnedRuntimeAvailable;
    private static final float BODY_TEXT_REFERENCE = 16f;

    public static boolean hasActivityOwnedRuntime() {
        return activityOwnedRuntimeAvailable;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundContinuityPlugin.class);
        registerPlugin(ManagedRelayPlugin.class);
        registerPlugin(HostGeometryPlugin.class);
        registerPlugin(HostTaskInputPlugin.class);
        super.onCreate(savedInstanceState);
        applyNativeTextPreference();
        activityOwnedRuntimeAvailable = true;
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration); // Retain Capacitor's plugin forwarding.
        applyNativeTextPreference();
    }

    /** One WebView percentage anchored to the UI's 16px body reference.
     * Native SP conversion respects the current platform preference, including nonlinear
     * scaling. A global WebView percentage does not reproduce that curve at every CSS size.
     * This activity owns text scaling; the renderer/geometry plugin never scale it again. */
    private void applyNativeTextPreference() {
        if (getBridge() == null) return;
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        float preferredPx = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, BODY_TEXT_REFERENCE, metrics);
        float unscaledPx = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, BODY_TEXT_REFERENCE, metrics);
        int percent = Math.round(100f * preferredPx / unscaledPx);
        WebSettings settings = getBridge().getWebView().getSettings();
        if (settings.getTextZoom() != percent) settings.setTextZoom(percent);
    }

    @Override
    public void onDestroy() {
        activityOwnedRuntimeAvailable = false;
        if (isFinishing()) {
            stopService(new Intent(this, BackgroundContinuityService.class));
        }
        super.onDestroy();
    }
}
