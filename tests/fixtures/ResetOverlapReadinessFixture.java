package com.clipp.app;
public final class ResetOverlapReadinessFixture {
    public static void main(String[] args) {
        System.out.print(ResetOverlapReadiness.expression("(() => { const root = document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]') || document; return [...root.querySelectorAll('button')].find(e => !e.disabled && !e.closest('[inert], [hidden], [aria-hidden=\"true\"]') && e.getClientRects().length && (e.getAttribute('aria-label') || e.textContent.trim()) === 'Continue reset overlap'); })()"));
    }
}
