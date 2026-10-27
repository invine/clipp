package com.clipp.app;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

final class ResetOverlapProgressPolicy {
    private static final Set<String> TRANSIENT = new HashSet<>(Arrays.asList(
        "shell-start-pending", "preflight-unavailable", "checking", "preconditions-pending",
        "begin-submitted", "start-held", "provisional-fence-held", "resume-submitted",
        "restart-required", "stopping", "stopped"));
    static boolean isTransient(String stage) { return TRANSIENT.contains(stage); }
}
