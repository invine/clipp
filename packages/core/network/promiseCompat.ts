// Networking dependencies use this API on older WebViews and Node hosts.
// Load before their modules; preserve the host's constructor and native method.
if (
  typeof (Promise as PromiseConstructor & { withResolvers?: unknown })
    .withResolvers !== "function"
) {
  Object.defineProperty(Promise, "withResolvers", {
    configurable: true,
    writable: true,
    value: function withResolvers<T>(this: PromiseConstructor) {
      let resolve: ((value: T | PromiseLike<T>) => void) | undefined;
      let reject: ((reason?: unknown) => void) | undefined;
      const promise = new this<T>((res, rej) => {
        if (resolve !== undefined || reject !== undefined) {
          throw new TypeError("Promise capability executor called twice");
        }
        resolve = res;
        reject = rej;
      });
      if (typeof resolve !== "function" || typeof reject !== "function") {
        throw new TypeError("Promise capability requires resolve and reject");
      }
      return { promise, resolve, reject };
    },
  });
}
