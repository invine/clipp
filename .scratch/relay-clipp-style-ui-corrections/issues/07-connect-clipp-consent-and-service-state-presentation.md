# 07 — Connect Clipp, consent and service-state presentation

Status: resolved
Owner: coordinator


Blocked by: None

**Delivers:** Setup, sign-in, consent and recovery tasks use the approved visual hierarchy and remain complete, readable and safe across responsive and no-script states.

**Visual evidence:** [Desktop Connect Clipp before](evidence/implementation-desktop-connect-dark.png), [phone Connect Clipp before](evidence/implementation-phone-connect-dark.png), [approved mockup](../../mockups/clipp-relay/index.html).

**Acceptance:**

- [ ] Connect Clipp retains the canonical selectable discovery endpoint, supported client setup, truthful copy success/refusal feedback and the Portal Session versus Login Grant explanation. Opening setup performs no connection or authorization.
- [ ] Dialog and no-script setup paths fit desktop, phone and enlarged text, expose named keyboard/focus/close controls and preserve existing safe destinations and fallback behavior.
- [ ] Sign-in, consent, restriction, conflict, rate-limit, service-failure, deletion and recovery states use consistent styling while retaining authoritative content, status codes, retry hints and permitted recovery actions.
- [ ] Consent shows the trusted account and registered client and preserves authorize/cancel behavior, validated callback, PKCE, one-use continuation, Origin/CSRF, expiry and credential-generation safeguards.
- [ ] Exercise production portal HTTP and built-service browser fixtures with isolated clipboard stubs and no-script/keyboard cases; do not connect, send Clips, use live identity providers or mutate real accounts.

## Answer

Connect Clipp remains a contextual task with the selectable canonical discovery endpoint, truthful clipboard success/refusal feedback, complete setup instructions, and Portal Session/Login Grant distinction. Dialog close, focus restoration, Escape and no-script access passed. Consent keeps the trusted account/client facts and authorize/cancel safeguards. The embedded Clipp mark initially failed under consent’s strict CSP; a same-origin-only `img-src 'self'` allowance now permits that asset, and consent-policy tests assert the exact policy. Built-service checks used a local identity-provider double and isolated clipboard stub only; no live provider or account was used. See `../run.md`.
