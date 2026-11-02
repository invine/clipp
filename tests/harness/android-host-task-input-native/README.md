# Android task-input Java source regression

Run from the repository root with a JDK (21 is the verified version):

```sh
CLIPP_SOURCE_JAVA_HOME=/path/to/jdk npm --workspace apps/android run test:native:source
```

This explicit JDK command is separate from the Node-only `npm run check`. It compiles the production `HostTaskInputPlugin.java` and the installed Capacitor `PluginCall.java` and `JSObject.java` without transforming their source. The runner reports their hashes and the installed Capacitor/JDK versions, then removes its own temporary class/source directory.

The fixture supplies external Android/Capacitor infrastructure and a minimal `org.json` container. Actual `JSObject.put(int)` calls the container's integer overload, which retains `Integer`; actual `PluginCall` reads that raw value. The container does not parse JSON or implement coercing numeric getters. The failing regression observes a second public Back dispatch after acknowledging the first, rather than inspecting the plugin's private fields.

The remaining scenarios exercise the same public boundary and external dispatcher model for numeric refusals, owner/sequence identity, root delegation, focus, delayed acknowledgement, disposal, unavailable owner and IME ordering. Unsafe high values are refused while sequence 1 is pending; the fixture does not manufacture a private pending counter at the safe-integer boundary.

This is source evidence only. The actual JSON parser, Android event dispatcher, IME and native UI remain unqualified by this command. It does not invoke Gradle, the Android SDK, ADB, native applications or host clipboard APIs.
