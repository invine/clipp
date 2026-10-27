package com.clipp.app;

/** Finite, content-free diagnostics for the isolated overlap acceptance input. */
final class ResetOverlapTapDiagnostics {
    static String dispatchPhase(String value) {
        if (value == null) return "unknown";
        if ("not-sent".equals(value)) return "not-sent";
        if (value.startsWith("down-sent;up-pending;")) return "down-sent";
        if (value.startsWith("down-complete;up-pending;")) return "down-complete";
        if (value.startsWith("down-complete;up-sent;")) return "up-sent";
        if (value.startsWith("down-complete;up-complete;")) return "up-complete";
        return "unknown";
    }

    static long dispatchUptime(String value, String field, long observedUptime) {
        if (value == null || !("downSent".equals(field) || "downReturned".equals(field)
            || "upSent".equals(field) || "upReturned".equals(field))) return -1;
        java.util.regex.Matcher match = java.util.regex.Pattern.compile("(?:^|;)" + field + "=([0-9]{1,16})(?:;|$)").matcher(value);
        if (!match.find()) return -1;
        try {
            long time = Long.parseLong(match.group(1));
            return time <= observedUptime ? time : -1;
        } catch (NumberFormatException error) { return -1; }
    }

    static String publicStage(String value) {
        if (value == null) return "other";
        switch (value) {
            case "start-held": case "provisional-fence-held": case "operation-unconfirmed":
            case "restart-required": case "replacement-ready": case "checking": case "stopped":
                return value;
            default: return "other";
        }
    }

    static String publicError(String value) {
        if (value == null) return "unclassified";
        switch (value) {
            case "overlap-deadline": case "start-unavailable": case "fence-unavailable":
            case "start-completed-early": case "reset-completed-early": return value;
            default: return "unclassified";
        }
    }

    static String classify(Throwable failure) {
        if (!(failure instanceof AssertionError)) return "unclassified";
        String message = failure.getMessage();
        if (message == null) return "unclassified";
        if (message.startsWith("Timed out: touch target available;")) return "target-unavailable";
        if (message.startsWith("Timed out: native geometry and fonts ready;")) return "geometry-not-ready";
        if (message.startsWith("Touch target did not settle:")) return "target-not-settled";
        if (message.startsWith("Owned focused RESUMED app root not observed:")) return "owned-window-unfocused";
        if (message.startsWith("Owned active-window observer unfinished after shared 5s budget:")) return "owned-window-observer-timeout";
        if (message.startsWith("Owned native-window readiness deadline expired:")) return "owned-window-deadline";
        if (message.startsWith("Android must accept the one physical DOWN: ")) return "physical-down-not-accepted";
        if (message.startsWith("Android must accept the one physical UP: ")) return "physical-up-not-accepted";
        switch (message) {
            case "Target must be inside the visible web viewport": return "viewport-bounds";
            case "Touch target must be inside the actual native WebView": return "native-webview-bounds";
            case "Physical pointer requires the actual foreground app window": return "foreground-window";
            case "Physical pointer requires the isolated app as active native window": return "isolated-active-window";
            case "Bounded native observations must be requested off the UI thread": return "observation-off-ui-thread";
            case "Native UI dispatch deadline expired": return "ui-dispatch-deadline";
            case "Main Looper rejected native observation": return "ui-post-rejected";
            case "Native UI observation interrupted": return "ui-observation-interrupted";
            case "Native UI observation did not complete within its deadline": return "ui-observation-deadline";
            case "Resolve native lifecycle ownership only on the UI thread": return "owner-ui-thread";
            case "Native observation must retain its actual task owner": return "owner-task";
            case "Actual Activity bridge required": return "activity-bridge";
            case "Actual Activity-owned WebView required": return "activity-webview";
            case "Public WebView result belongs to an obsolete Activity": return "obsolete-activity-result";
            case "WebView evaluation timed out within shared UI/callback deadline": return "webview-evaluation-deadline";
            case "WebView returned no evaluation result": return "webview-result-unavailable";
            default: return "unclassified";
        }
    }
}
