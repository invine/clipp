package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;

import android.content.res.Configuration;
import android.util.TypedValue;
import android.webkit.WebView;
import android.widget.TextView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Root runs this under assigned default/enlarged guest settings; it never changes them. */
@RunWith(AndroidJUnit4.class)
public final class NativeTextPreferenceTest {
    @Test
    public void owningWebViewUsesNativeBodyReferenceWithoutAccumulatingConfigurationUpdates() {
        NativeAcceptanceTarget.requireIsolated(InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                // Actual native widgets provide the independent platform preference oracle,
                // including Android's nonlinear SP conversion; do not duplicate the owner's equation.
                TextView nativeBody = new TextView(activity);
                nativeBody.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
                TextView unscaledBody = new TextView(activity);
                unscaledBody.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 16);
                WebView webView = activity.getBridge().getWebView();
                int initialPercent = webView.getSettings().getTextZoom();
                float renderedReferencePx = unscaledBody.getTextSize() * initialPercent / 100f;
                // WebSettings accepts integer percentages; allow at most one percent rounding.
                assertEquals(nativeBody.getTextSize(), renderedReferencePx, unscaledBody.getTextSize() / 100f);
                activity.onConfigurationChanged(new Configuration(activity.getResources().getConfiguration()));
                activity.onConfigurationChanged(new Configuration(activity.getResources().getConfiguration()));
                assertSame(webView, activity.getBridge().getWebView());
                assertEquals(initialPercent, webView.getSettings().getTextZoom());
            });
        }
    }
}
