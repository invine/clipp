package com.clipp.app;

import static org.junit.Assert.assertTrue;

import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs the production Capacitor adapter in its actual WebView without mounting React. */
@RunWith(AndroidJUnit4.class)
public final class AndroidUiRuntimeAdapterWebViewTest {
    @Test
    public void productionAdapterConformsInAndroidWebView() throws Exception {
        NativeAcceptanceTarget.requireIsolated(
            InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName()
        );
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            NativePublicWebView web = new NativePublicWebView(
                InstrumentationRegistry.getInstrumentation(), scenario
            );
            String bundle;
            try (InputStream input = InstrumentationRegistry.getInstrumentation()
                .getContext().getAssets().open("ui-runtime-adapter.js")) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
                bundle = bytes.toString(StandardCharsets.UTF_8.name());
            }

            web.onActivity(activity -> {
                WebView view = activity.getBridge().getWebView();
                view.evaluateJavascript(
                    "document.documentElement.dataset.adapterFixture='blank';document.body.replaceChildren();true",
                    null
                );
            });
            web.await("React-free adapter document", "document.documentElement.dataset.adapterFixture === 'blank' && document.body.childElementCount === 0");
            String evaluate = "(() => {" + bundle +
                "; globalThis.__adapterDone = false; globalThis.__adapterResult = null;" +
                "runAndroidUiRuntimeAdapterConformance().then(value => { globalThis.__adapterResult = value; globalThis.__adapterDone = true; }).catch(error => { globalThis.__adapterResult = { error: String(error && error.stack || error) }; globalThis.__adapterDone = true; }); return true; })()";
            assertTrue("Adapter fixture did not start", "true".equals(web.evaluate(evaluate)));
            web.await("production adapter conformance", "globalThis.__adapterDone === true");
            String result = web.evaluate("JSON.stringify(globalThis.__adapterResult)");
            assertTrue("Production adapter WebView conformance failed: " + result,
                result != null && result.contains("\"ok\":true"));
        }
    }
}
