package com.clipp.app;

public final class ResetOverlapTapDiagnosticsFixture {
    private static void expect(String expected, Throwable failure) {
        String actual = ResetOverlapTapDiagnostics.classify(failure);
        if (!expected.equals(actual) || actual.contains("PRIVATE_SENTINEL")) throw new AssertionError(actual);
    }
    public static void main(String[] args) {
        expect("target-unavailable", new AssertionError("Timed out: touch target available; PRIVATE_SENTINEL"));
        expect("geometry-not-ready", new AssertionError("Timed out: native geometry and fonts ready; PRIVATE_SENTINEL"));
        expect("target-not-settled", new AssertionError("Touch target did not settle: PRIVATE_SENTINEL"));
        expect("owned-window-unfocused", new AssertionError("Owned focused RESUMED app root not observed: PRIVATE_SENTINEL"));
        expect("owned-window-observer-timeout", new AssertionError("Owned active-window observer unfinished after shared 5s budget: PRIVATE_SENTINEL"));
        expect("owned-window-deadline", new AssertionError("Owned native-window readiness deadline expired: PRIVATE_SENTINEL"));
        expect("webview-evaluation-deadline", new AssertionError("WebView evaluation timed out within shared UI/callback deadline"));
        expect("physical-down-not-accepted", new AssertionError("Android must accept the one physical DOWN: PRIVATE_SENTINEL"));
        expect("physical-up-not-accepted", new AssertionError("Android must accept the one physical UP: PRIVATE_SENTINEL"));
        expect("unclassified", new RuntimeException("PRIVATE_SENTINEL"));
        expect("unclassified", new AssertionError("PRIVATE_SENTINEL"));
        String sent = "down-complete;up-sent;downSent=120;downReturned=125;upSent=166;PRIVATE_SENTINEL";
        if (!"up-sent".equals(ResetOverlapTapDiagnostics.dispatchPhase(sent))) throw new AssertionError();
        if (ResetOverlapTapDiagnostics.dispatchUptime(sent, "downSent", 200) != 120) throw new AssertionError();
        if (ResetOverlapTapDiagnostics.dispatchUptime(sent, "upReturned", 200) != -1) throw new AssertionError();
        if (ResetOverlapTapDiagnostics.dispatchUptime(sent, "PRIVATE_SENTINEL", 200) != -1) throw new AssertionError();
        if (ResetOverlapTapDiagnostics.dispatchUptime("x;downSent=201", "downSent", 200) != -1) throw new AssertionError();
        if (!"unknown".equals(ResetOverlapTapDiagnostics.dispatchPhase("PRIVATE_SENTINEL"))) throw new AssertionError();
        if (!"operation-unconfirmed".equals(ResetOverlapTapDiagnostics.publicStage("operation-unconfirmed"))) throw new AssertionError();
        if (!"other".equals(ResetOverlapTapDiagnostics.publicStage("PRIVATE_SENTINEL"))) throw new AssertionError();
        if (!"overlap-deadline".equals(ResetOverlapTapDiagnostics.publicError("overlap-deadline"))) throw new AssertionError();
        if (!"unclassified".equals(ResetOverlapTapDiagnostics.publicError("PRIVATE_SENTINEL"))) throw new AssertionError();
        try {
            ResetOverlapBoundedObservation.Result<String> success = ResetOverlapBoundedObservation.read(() -> "observed", 500);
            if (!"observed".equals(success.status) || !"observed".equals(success.value)) throw new AssertionError();
            ResetOverlapBoundedObservation.Result<String> failure = ResetOverlapBoundedObservation.read(() -> { throw new RuntimeException("PRIVATE_SENTINEL"); }, 500);
            if (!"read-failed".equals(failure.status) || failure.value != null) throw new AssertionError();
            long start = System.nanoTime();
            ResetOverlapBoundedObservation.Result<String> timeout = ResetOverlapBoundedObservation.read(() -> { Thread.sleep(5000); return "late"; }, 20);
            if (!"timeout".equals(timeout.status) || timeout.value != null || System.nanoTime() - start > 1000000000L) throw new AssertionError();
            java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
            ResetOverlapBoundedObservation.Result<String> unclosed = ResetOverlapBoundedObservation.read(() -> {
                while (release.getCount() != 0) {
                    try { release.await(); } catch (InterruptedException ignored) {}
                }
                return "late";
            }, 20);
            if (!"worker-unclosed".equals(unclosed.status) || unclosed.value != null) throw new AssertionError();
            release.countDown();
            java.util.concurrent.CountDownLatch active = new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.CountDownLatch unblock = new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.atomic.AtomicReference<ResetOverlapBoundedObservation.Result<String>> interruptedResult = new java.util.concurrent.atomic.AtomicReference<>();
            java.util.concurrent.atomic.AtomicBoolean preservedInterrupt = new java.util.concurrent.atomic.AtomicBoolean();
            Thread caller = new Thread(() -> {
                interruptedResult.set(ResetOverlapBoundedObservation.read(() -> {
                    active.countDown();
                    while (unblock.getCount() != 0) {
                        try { unblock.await(); } catch (InterruptedException ignored) {}
                    }
                    return "late";
                }, 1000));
                preservedInterrupt.set(Thread.currentThread().isInterrupted());
            });
            caller.start();
            if (!active.await(500, java.util.concurrent.TimeUnit.MILLISECONDS)) throw new AssertionError();
            caller.interrupt();
            caller.join(1000);
            if (caller.isAlive() || interruptedResult.get() == null || !"interrupted-worker-unclosed".equals(interruptedResult.get().status)
                || interruptedResult.get().value != null || !preservedInterrupt.get()) throw new AssertionError();
            unblock.countDown();
        } catch (Exception error) { throw new AssertionError(error); }
    }
}
