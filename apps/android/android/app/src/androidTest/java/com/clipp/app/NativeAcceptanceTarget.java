package com.clipp.app;

/** Safety boundary for fixtures that alter native application storage. */
final class NativeAcceptanceTarget {
    static void requireIsolated(String packageName) {
        if (!"com.clipp.app.acceptance".equals(packageName)) {
            throw new IllegalStateException("Native fixtures require com.clipp.app.acceptance; operator app refused");
        }
    }
}
