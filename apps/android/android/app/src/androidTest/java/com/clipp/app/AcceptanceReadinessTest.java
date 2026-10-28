package com.clipp.app;

import static org.junit.Assert.assertTrue;

import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Observe the actual owning WebView, not a package-presence surrogate. */
@RunWith(AndroidJUnit4.class)
public final class AcceptanceReadinessTest {
    @Test
    public void bundledWebViewStarts() {
        NativeAcceptanceTarget.requireIsolated(
            InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName()
        );
        AtomicReference<String> url = new AtomicReference<>();
        AtomicReference<String> configuredServer = new AtomicReference<>();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long deadline = SystemClock.elapsedRealtime() + 10000;
            do {
                scenario.onActivity(activity -> {
                    if (activity.getBridge() != null) {
                        configuredServer.set(activity.getBridge().getServerUrl());
                        url.set(activity.getBridge().getWebView().getUrl());
                    }
                });
                if (url.get() != null && !"about:blank".equals(url.get())) break;
                SystemClock.sleep(50);
            } while (SystemClock.elapsedRealtime() < deadline);
            assertTrue("Bundled WebView must not use a development server", configuredServer.get() == null || configuredServer.get().isEmpty());
            assertTrue("Owning WebView URL must be observable", url.get() != null);
            Uri observed = Uri.parse(url.get());
            assertTrue("Bundled WebView origin required", "https".equals(observed.getScheme()) && "localhost".equals(observed.getHost()) && observed.getPort() == -1);
            assertTrue("Bundled WebView entry required", (observed.getPath() == null || observed.getPath().isEmpty() || "/".equals(observed.getPath()) || "/index.html".equals(observed.getPath())) && observed.getQuery() == null && observed.getFragment() == null);
            Bundle status = new Bundle();
            status.putString("clipp_bundled_url", url.get());
            InstrumentationRegistry.getInstrumentation().sendStatus(0, status);
        }
    }
}
