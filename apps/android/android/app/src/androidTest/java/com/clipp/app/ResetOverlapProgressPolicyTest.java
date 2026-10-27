package com.clipp.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public final class ResetOverlapProgressPolicyTest {
    @Test public void acceptsActualOverlapTransitionsButRejectsUnconfirmedOutcomes() {
        assertTrue(ResetOverlapProgressPolicy.isTransient("start-held"));
        assertTrue(ResetOverlapProgressPolicy.isTransient("provisional-fence-held"));
        assertTrue(ResetOverlapProgressPolicy.isTransient("restart-required"));
        assertFalse(ResetOverlapProgressPolicy.isTransient("operation-unconfirmed"));
        assertFalse(ResetOverlapProgressPolicy.isTransient("reset-rejected"));
    }
}
