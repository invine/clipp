package com.clipp.app;

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** Acceptance-only read boundary. Never returns exception text or a late result. */
final class ResetOverlapBoundedObservation {
    static final class Result<T> {
        final String status;
        final T value;
        Result(String status, T value) { this.status = status; this.value = value; }
    }
    static <T> Result<T> read(Callable<T> observation, long timeoutMs) {
        if (timeoutMs < 1 || timeoutMs > 2000) throw new IllegalArgumentException("invalid_observation_deadline");
        FutureTask<T> task = new FutureTask<>(observation);
        Thread worker = new Thread(task, "clipp-overlap-failure-observation");
        worker.setDaemon(true);
        worker.start();
        try {
            T value = task.get(timeoutMs, TimeUnit.MILLISECONDS);
            return new Result<>(value == null ? "unavailable" : "observed", value);
        } catch (TimeoutException timeout) {
            return cancelAndClose(task, worker, false);
        } catch (InterruptedException interrupted) {
            return cancelAndClose(task, worker, true);
        } catch (ExecutionException failure) {
            return new Result<>("read-failed", null);
        }
    }
    private static <T> Result<T> cancelAndClose(FutureTask<T> task, Thread worker, boolean interrupted) {
        task.cancel(true);
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(200);
        while (worker.isAlive()) {
            long remaining = deadline - System.nanoTime();
            if (remaining <= 0) break;
            try { worker.join(TimeUnit.NANOSECONDS.toMillis(remaining), (int) (remaining % 1000000)); }
            catch (InterruptedException again) { interrupted = true; }
        }
        boolean unclosed = worker.isAlive();
        if (interrupted) Thread.currentThread().interrupt();
        return new Result<>(interrupted
            ? (unclosed ? "interrupted-worker-unclosed" : "interrupted")
            : (unclosed ? "worker-unclosed" : "timeout"), null);
    }

}
