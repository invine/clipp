import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// Runs the actual Java plugin against external Android/Capacitor boundary stubs.
// Plain JVM source fixture only: no Android SDK/device/UI/clipboard/network.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = resolve(process.argv[2]);
const jdk = process.argv[3];
if (!jdk) throw new Error("Specify the source fixture JDK directory");
const src = join(out, "java-src");
const classes = join(out, "classes");
await mkdir(classes, { recursive: true });
const sources = {
  "android/view/View.java": `package android.view; public class View {}`,
  "androidx/activity/OnBackPressedCallback.java": `package androidx.activity;
public abstract class OnBackPressedCallback {
  private boolean enabled; public boolean removed;
  public OnBackPressedCallback(boolean value) { enabled = value; }
  public void setEnabled(boolean value) { enabled = value; }
  public boolean isEnabled() { return enabled && !removed; }
  public void remove() { removed = true; }
  public abstract void handleOnBackPressed();
}`,
  "androidx/activity/OnBackPressedDispatcher.java": `package androidx.activity;
public class OnBackPressedDispatcher {
  public OnBackPressedCallback callback; public int rootDelegations;
  public void addCallback(Object activity, OnBackPressedCallback value) { callback = value; }
  public void onBackPressed() {
    if (callback != null && callback.isEnabled()) callback.handleOnBackPressed();
    else rootDelegations++;
  }
}`,
  "androidx/appcompat/app/AppCompatActivity.java": `package androidx.appcompat.app;
public class AppCompatActivity {
  public boolean focused = true;
  private final androidx.activity.OnBackPressedDispatcher dispatcher = new androidx.activity.OnBackPressedDispatcher();
  public void runOnUiThread(Runnable action) { action.run(); }
  public boolean hasWindowFocus() { return focused; }
  public Object getWindow() { return this; }
  public androidx.activity.OnBackPressedDispatcher getOnBackPressedDispatcher() { return dispatcher; }
}`,
  "androidx/core/view/WindowInsetsCompat.java": `package androidx.core.view;
public class WindowInsetsCompat {
  public boolean imeVisible;
  public static class Type { public static int ime() { return 1; } }
  public boolean isVisible(int type) { return imeVisible; }
}`,
  "androidx/core/view/ViewCompat.java": `package androidx.core.view;
public class ViewCompat {
  public static WindowInsetsCompat insets = new WindowInsetsCompat();
  public static WindowInsetsCompat getRootWindowInsets(android.view.View view) { return insets; }
}`,
  "androidx/core/view/WindowInsetsControllerCompat.java": `package androidx.core.view;
public class WindowInsetsControllerCompat {
  public static int hides;
  public WindowInsetsControllerCompat(Object window, android.view.View view) {}
  public void hide(int type) { hides++; ViewCompat.insets.imeVisible = false; }
}`,
  "com/getcapacitor/JSObject.java": `package com.getcapacitor; public class JSObject extends java.util.HashMap<String, Object> {}`,
  "com/getcapacitor/Bridge.java": `package com.getcapacitor;
public class Bridge {
  private final android.view.View view = new android.view.View();
  public android.view.View getWebView() { return view; }
}`,
  "com/getcapacitor/Plugin.java": `package com.getcapacitor;
public class Plugin {
  public final androidx.appcompat.app.AppCompatActivity activity = new androidx.appcompat.app.AppCompatActivity();
  public final java.util.List<JSObject> events = new java.util.ArrayList<>();
  private final Bridge bridge = new Bridge();
  public androidx.appcompat.app.AppCompatActivity getActivity() { return activity; }
  public Bridge getBridge() { return bridge; }
  public void load() {} protected void handleOnDestroy() {}
  public void destroy() { handleOnDestroy(); }
  public void notifyListeners(String event, JSObject value) { events.add(value); }
}`,
  "com/getcapacitor/PluginCall.java": `package com.getcapacitor;
public class PluginCall {
  public final java.util.Map<String, Object> values = new java.util.HashMap<>();
  public String error;
  public String getString(String key) { return (String)values.get(key); }
  public Boolean getBoolean(String key) { return (Boolean)values.get(key); }
  public Long getLong(String key) { Object value = values.get(key); return value == null ? null : ((Number)value).longValue(); }
  public void resolve() {} public void reject(String reason) { error = reason; }
}`,
  "com/getcapacitor/PluginMethod.java": `package com.getcapacitor; public @interface PluginMethod {}`,
  "com/getcapacitor/annotation/CapacitorPlugin.java": `package com.getcapacitor.annotation; public @interface CapacitorPlugin { String name(); }`,
  "HostTaskInputFixture.java": `import com.clipp.app.HostTaskInputPlugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.JSObject;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
public class HostTaskInputFixture {
  private static int failures;
  private static HostTaskInputPlugin fresh() {
    ViewCompat.insets = new WindowInsetsCompat(); WindowInsetsControllerCompat.hides = 0;
    HostTaskInputPlugin plugin = new HostTaskInputPlugin(); plugin.load(); return plugin;
  }
  private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
  private static void back(HostTaskInputPlugin plugin) { plugin.activity.getOnBackPressedDispatcher().onBackPressed(); }
  private static int roots(HostTaskInputPlugin plugin) { return plugin.activity.getOnBackPressedDispatcher().rootDelegations; }
  private static void ready(HostTaskInputPlugin plugin, String owner, boolean value) {
    PluginCall call = new PluginCall(); call.values.put("owner", owner); call.values.put("ready", value); plugin.setReady(call);
  }
  private static void complete(HostTaskInputPlugin plugin, String owner, long sequence, boolean handled) {
    PluginCall call = new PluginCall(); call.values.put("owner", owner); call.values.put("sequence", sequence); call.values.put("handled", handled); plugin.completeBack(call);
  }
  private static long sequence(JSObject event) { return ((Number)event.get("sequence")).longValue(); }
  private static void run(String name, Runnable action) {
    try { action.run(); System.out.println("PASS: " + name); }
    catch (AssertionError error) { failures++; System.out.println("FAIL: " + name + " | " + error.getMessage()); }
  }
  public static void main(String[] args) {
    run("delayed or absent listener consumes startup Back without stale JS or root exit", () -> {
      HostTaskInputPlugin plugin = fresh(); back(plugin); back(plugin);
      check(roots(plugin) == 0, "Unready Back delegated to Activity root");
      check(plugin.events.isEmpty(), "Unready Back notified JavaScript");
      ready(plugin, "live", true); back(plugin);
      check(plugin.events.size() == 1, "Live owner did not receive a fresh Back");
      complete(plugin, "live", sequence(plugin.events.get(0)), true);
      check(roots(plugin) == 0, "Handled task Back delegated root");
    });
    run("IME stays first while startup listener is unavailable", () -> {
      HostTaskInputPlugin plugin = fresh(); ViewCompat.insets.imeVisible = true; back(plugin);
      check(WindowInsetsControllerCompat.hides == 1, "Unready native Back did not hide IME");
      check(roots(plugin) == 0 && plugin.events.isEmpty(), "IME Back escaped or notified JS");
    });
    run("failed readiness and document disposal retain safe interception", () -> {
      HostTaskInputPlugin failed = fresh(); ready(failed, "failed", false); back(failed);
      check(roots(failed) == 0 && failed.events.isEmpty(), "Failed listener allowed root exit");
      HostTaskInputPlugin disposed = fresh(); ready(disposed, "old", true); back(disposed);
      long old = sequence(disposed.events.get(0)); ready(disposed, "old", false);
      back(disposed); complete(disposed, "old", old, false);
      check(roots(disposed) == 0 && disposed.events.size() == 1, "Disposed consumer dispatched or exited");
      ready(disposed, "new", true); ready(disposed, "old", false); back(disposed);
      check(disposed.events.size() == 2 && "new".equals(disposed.events.get(1).get("owner")), "Old disposal deactivated replacement owner");
    });
    run("only live owner confirmation delegates root and the token delegates once", () -> {
      HostTaskInputPlugin plugin = fresh(); ready(plugin, "live", true); back(plugin); back(plugin);
      check(plugin.events.size() == 1, "Pending Back repeated JS delivery");
      long token = sequence(plugin.events.get(0)); complete(plugin, "stale", token, false);
      check(roots(plugin) == 0, "Stale owner delegated root");
      complete(plugin, "live", token, false); complete(plugin, "live", token, false);
      check(roots(plugin) == 1, "Confirmed root delegated more or less than once");
      ready(plugin, "live", false); back(plugin);
      check(roots(plugin) == 1, "Unready callback lost interception after confirmed root");
    });
    run("unavailable insets and native focus loss consume without changing the task", () -> {
      HostTaskInputPlugin plugin = fresh(); ready(plugin, "live", true); ViewCompat.insets = null; back(plugin);
      check(roots(plugin) == 0 && plugin.events.isEmpty(), "Unknown IME state dispatched or exited");
      ViewCompat.insets = new WindowInsetsCompat(); plugin.activity.focused = false; back(plugin);
      check(roots(plugin) == 0 && plugin.events.isEmpty(), "Unfocused Activity dispatched or exited");
      plugin.activity.focused = true; back(plugin); long token = sequence(plugin.events.get(0));
      plugin.activity.focused = false; complete(plugin, "live", token, false);
      check(roots(plugin) == 0, "Late acknowledgment after focus loss exited");
    });
    if (failures > 0) System.exit(1);
  }
}`,
};
const pluginPath =
  "apps/android/android/app/src/main/java/com/clipp/app/HostTaskInputPlugin.java";
const plugin = await readFile(join(repo, pluginPath), "utf8");
sources["com/clipp/app/HostTaskInputPlugin.java"] = plugin;
for (const [path, contents] of Object.entries(sources)) {
  await mkdir(dirname(join(src, path)), { recursive: true });
  await writeFile(join(src, path), contents);
}
const report = {
  nativeHost: false,
  seam: "actual HostTaskInputPlugin callback with external Android/Capacitor JVM stubs",
  sdk: "none",
  clipboard: "none",
  sourceSha256: createHash("sha256").update(plugin).digest("hex"),
  node: process.version,
  jdk,
  java: execFileSync(join(jdk, "bin/java"), ["--version"], {
    encoding: "utf8",
  }).trim(),
  javac: execFileSync(join(jdk, "bin/javac"), ["-version"], {
    encoding: "utf8",
  }).trim(),
};
try {
  execFileSync(join(jdk, "bin/javac"), [
    "-d",
    classes,
    ...Object.keys(sources).map((path) => join(src, path)),
  ]);
  try {
    report.output = execFileSync(
      join(jdk, "bin/java"),
      ["-cp", classes, "HostTaskInputFixture"],
      { encoding: "utf8" }
    );
  } catch (error) {
    report.output = error.stdout.toString();
    throw error;
  }
} finally {
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
}
