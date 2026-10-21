/* androidTest only: one controlled real IndexedDB transaction failure, never a product API. */
function installPendingWitness(config) {
  const key = "__clippPolicyPendingWitness20";
  if (
    location.origin !== "https://localhost" ||
    location.pathname !== "/" ||
    document.getElementById("clipp-reset-owning-progress") ||
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.keys(config).sort().join(",") !== "marker,nonce" ||
    !/^[A-Za-z0-9-]{1,32}$/.test(config.nonce) ||
    config.marker !== `clip-policy-pending-${config.nonce}` ||
    Object.prototype.hasOwnProperty.call(globalThis, key)
  )
    throw new Error("Invalid isolated pending-event witness assignment");

  const prototype = IDBObjectStore.prototype;
  const original = Object.getOwnPropertyDescriptor(prototype, "put");
  if (
    !original ||
    typeof original.value !== "function" ||
    !original.configurable
  )
    throw new Error("Public IndexedDB put cannot be owned safely");
  const nonce = config.nonce;
  const marker = config.marker;
  const startedAt = Date.now();
  const started = performance.now();
  const deadlineMs = 120_000;
  const trace = [];
  const listeners = [];
  const transactions = new WeakSet();
  const encoder = new TextEncoder();
  let attempts = 0,
    aborts = 0,
    completes = 0;
  let event = null,
    failure = null,
    armed = true,
    disposed = false;
  let restored = false,
    timer,
    api;

  const ownedDescriptor = () => {
    const current = Object.getOwnPropertyDescriptor(prototype, "put");
    return (
      current?.value === wrapper &&
      current.configurable === original.configurable &&
      current.enumerable === original.enumerable &&
      current.writable === original.writable
    );
  };
  const fail = (reason) => {
    failure ??= reason;
    dispose(false);
  };
  const record = (kind, attempt, attemptFirstStoredAt) => {
    if (trace.length >= 64) {
      fail("timeline_limit");
      return;
    }
    trace.push({
      kind,
      attempt,
      elapsedMs: performance.now() - started,
      ...(attemptFirstStoredAt === undefined ? {} : { attemptFirstStoredAt }),
    });
  };
  const snapshot = () => ({
    nonce,
    marker,
    startedAt,
    elapsedMs: performance.now() - started,
    deadlineMs,
    armed,
    disposed,
    restored,
    descriptorOwned: ownedDescriptor(),
    attempts,
    aborts,
    completes,
    event: event && { ...event },
    failure,
    trace: trace.map((entry) => ({ ...entry })),
  });
  const read = () => {
    const value = snapshot();
    if (encoder.encode(JSON.stringify(value)).byteLength > 32_768) {
      fail("snapshot_limit");
      return { nonce, failure, disposed, restored };
    }
    return value;
  };
  function dispose(removeGlobal = true) {
    if (!disposed) {
      armed = false;
      disposed = true;
      clearTimeout(timer);
      for (const [target, type, listener] of listeners)
        target.removeEventListener(type, listener);
      listeners.length = 0;
      if (ownedDescriptor()) {
        Object.defineProperty(prototype, "put", original);
        restored = true;
      } else failure ??= "put_descriptor_replaced";
    }
    if (removeGlobal) {
      const ownGlobal = Object.getOwnPropertyDescriptor(globalThis, key);
      if (ownGlobal?.value === api) delete globalThis[key];
      else if (api) failure ??= "witness_descriptor_replaced";
    }
    return snapshot();
  }
  const listen = (target, type, listener) => {
    target.addEventListener(type, listener);
    listeners.push([target, type, listener]);
  };
  function wrapper(...args) {
    // The original receiver, arguments and real request are retained for every operation.
    const request = Reflect.apply(original.value, this, args);
    const value = args[0];
    if (
      this.name !== "history" ||
      this.transaction.db.name !== "clipp-history" ||
      this.transaction.mode !== "readwrite" ||
      value?.clip?.content !== marker
    )
      return request;
    if (
      !armed ||
      !ownedDescriptor() ||
      performance.now() - started >= deadlineMs
    ) {
      fail("target_outside_owned_interval");
      return request;
    }
    const clip = value.clip;
    if (
      clip.type !== "text" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        clip.id
      ) ||
      !/^12D3KooW[A-Za-z0-9]{40,60}$/.test(clip.originPeerId) ||
      !Number.isSafeInteger(clip.capturedAt) ||
      clip.capturedAt <= 0 ||
      !Number.isSafeInteger(clip.shareExpiresAt) ||
      clip.shareExpiresAt - clip.capturedAt !== 3_600_000 ||
      !Number.isSafeInteger(value.firstStoredAt)
    ) {
      fail("unexpected_target_metadata");
      return request;
    }
    const actual = {
      id: clip.id,
      type: clip.type,
      content: marker,
      originPeerId: clip.originPeerId,
      capturedAt: clip.capturedAt,
      shareExpiresAt: clip.shareExpiresAt,
    };
    if (event && JSON.stringify(event) !== JSON.stringify(actual)) {
      fail("immutable_event_changed");
      return request;
    }
    event ??= actual;
    if (++attempts > 64 || transactions.has(this.transaction)) {
      fail("target_attempt_limit_or_repeated_put");
      return request;
    }
    const attempt = attempts;
    const transaction = this.transaction;
    transactions.add(transaction);
    record("put-issued-uncommitted", attempt, value.firstStoredAt);
    listen(transaction, "abort", () => {
      aborts += 1;
      record("actual-transaction-abort", attempt);
    });
    listen(transaction, "complete", () => {
      completes += 1;
      fail("target_transaction_committed");
    });
    listen(request, "success", () => {
      if (
        !armed ||
        !ownedDescriptor() ||
        performance.now() - started >= deadlineMs
      ) {
        fail("success_outside_owned_interval");
        return;
      }
      try {
        record("real-put-success-before-transaction-abort", attempt);
        if (armed) transaction.abort();
      } catch {
        fail("actual_transaction_abort_failed");
      }
    });
    return request;
  }
  Object.defineProperty(prototype, "put", { ...original, value: wrapper });
  api = Object.freeze({ read, dispose: () => dispose() });
  try {
    Object.defineProperty(globalThis, key, {
      value: api,
      configurable: true,
      enumerable: false,
      writable: false,
    });
    timer = setTimeout(() => fail("fault_deadline_elapsed"), deadlineMs);
    return read();
  } catch (error) {
    dispose();
    throw error;
  }
}
