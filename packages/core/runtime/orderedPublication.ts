/** Serializes public projections and discards reads invalidated before publication. */
export function createOrderedStatePublisher<State>(port: {
  read(): Promise<State>;
  publish(state: State): void | Promise<void>;
}) {
  let requested = 0;
  let tail = Promise.resolve();

  return {
    request(): Promise<void> {
      const revision = ++requested;
      const task = tail.then(async () => {
        if (revision !== requested) return;
        const state = await port.read();
        if (revision === requested) await port.publish(state);
      });
      tail = task.catch(() => undefined);
      return task;
    },
  };
}
