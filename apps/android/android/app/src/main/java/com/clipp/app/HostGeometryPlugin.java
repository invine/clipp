package com.clipp.app;

import android.content.res.Configuration;
import android.graphics.Rect;
import android.os.Build;
import android.view.View;
import android.view.ViewTreeObserver;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Measures only. The renderer reserves the intersection with the actual WebView once. */
@CapacitorPlugin(name = "HostGeometry")
public final class HostGeometryPlugin extends Plugin {
    private View webView;
    private long sequence;
    private boolean destroyed;
    private final ViewTreeObserver.OnGlobalLayoutListener layoutListener = this::publish;

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> {
            if (destroyed) return;
            webView = getBridge().getWebView();
            webView.getViewTreeObserver().addOnGlobalLayoutListener(layoutListener);
            ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
                view.post(this::publish);
                return insets; // No padding, margins or consumed insets.
            });
            ViewCompat.requestApplyInsets(webView);
            publish();
        });
    }

    @PluginMethod
    public void getSnapshot(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject snapshot = measure();
            if (snapshot == null) call.reject("host_geometry_unavailable");
            else call.resolve(snapshot);
        });
    }

    private JSObject measure() {
        if (destroyed || webView == null || webView.getWidth() <= 0 || webView.getHeight() <= 0) return null;
        int[] location = new int[2];
        webView.getLocationOnScreen(location);
        Rect view = new Rect(location[0], location[1], location[0] + webView.getWidth(), location[1] + webView.getHeight());
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(webView);
        if (insets == null) return null;
        Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
        Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
        Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
        Rect window;
        Rect safe;
        if (Build.VERSION.SDK_INT >= 30) {
            window = getActivity().getWindowManager().getCurrentWindowMetrics().getBounds();
            // Type unions use the largest overlapping inset, including IME/navigation.
            Insets reserved = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            safe = new Rect(window.left + reserved.left, window.top + reserved.top,
                window.right - reserved.right, window.bottom - reserved.bottom);
        } else {
            // Legacy Android supplies an already fitted visible frame (including IME).
            View decor = getActivity().getWindow().getDecorView();
            int[] decorLocation = new int[2];
            decor.getLocationOnScreen(decorLocation);
            window = new Rect(decorLocation[0], decorLocation[1],
                decorLocation[0] + decor.getWidth(), decorLocation[1] + decor.getHeight());
            safe = new Rect();
            webView.getWindowVisibleDisplayFrame(safe);
        }
        JSObject snapshot = new JSObject();
        snapshot.put("sequence", ++sequence);
        snapshot.put("windowPx", rect(window));
        snapshot.put("webViewPx", rect(view));
        snapshot.put("safeAreaPx", rect(safe));
        snapshot.put("systemBarsPx", inset(bars));
        snapshot.put("cutoutPx", inset(cutout));
        snapshot.put("imePx", inset(ime));
        snapshot.put("density", getActivity().getResources().getDisplayMetrics().density);
        snapshot.put("fontScale", getActivity().getResources().getConfiguration().fontScale);
        snapshot.put("imeVisible", insets.isVisible(WindowInsetsCompat.Type.ime()));
        return snapshot;
    }

    private static JSObject rect(Rect rect) {
        JSObject result = new JSObject();
        result.put("left", rect.left); result.put("top", rect.top);
        result.put("width", rect.width()); result.put("height", rect.height());
        return result;
    }

    private static JSObject inset(Insets inset) {
        JSObject result = new JSObject();
        result.put("left", inset.left); result.put("top", inset.top);
        result.put("right", inset.right); result.put("bottom", inset.bottom);
        return result;
    }

    private void publish() {
        JSObject snapshot = measure();
        if (snapshot != null) notifyListeners("geometryChanged", snapshot);
    }

    @Override
    protected void handleOnResume() { if (webView != null) webView.post(this::publish); }

    @Override
    protected void handleOnConfigurationChanged(Configuration configuration) {
        if (webView != null) webView.post(this::publish);
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        if (webView != null) {
            if (webView.getViewTreeObserver().isAlive()) webView.getViewTreeObserver().removeOnGlobalLayoutListener(layoutListener);
            ViewCompat.setOnApplyWindowInsetsListener(webView, null);
        }
    }
}
