package com.clipp.app;

import static org.junit.Assert.assertTrue;

import android.graphics.Rect;
import android.util.Log;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class HostGeometryTest {
    @Test
    public void measuresPhysicalWebViewAndWindowSeparately() throws Exception {
        NativeAcceptanceTarget.requireIsolated(InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            Thread.sleep(1500);
            scenario.onActivity(activity -> {
                View webView = activity.getBridge().getWebView();
                int[] location = new int[2];
                webView.getLocationOnScreen(location);
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(webView);
                assertTrue(webView.getWidth() > 0 && webView.getHeight() > 0);
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                Rect window = activity.getWindowManager().getCurrentWindowMetrics().getBounds();
                Log.i("ClippHostGeometry", "windowPx=" + window + ";webViewPx=" + location[0] + "," + location[1] + "," + webView.getWidth() + "," + webView.getHeight() + ";systemBarsPx=" + bars + ";density=" + activity.getResources().getDisplayMetrics().density + ";fontScale=" + activity.getResources().getConfiguration().fontScale);
            });
        }
    }
}
