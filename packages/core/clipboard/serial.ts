/** Serializes asynchronous clipboard operations while allowing later work after failures. */
export function createSerializedExecutor() {
  let tail = Promise.resolve();

  const execute = async <Result>(work: () => Promise<Result>): Promise<Result> => {
    const next = tail.then(work, work);
    tail = next.then(() => undefined, () => undefined);
    return next;
  };

  execute.drain = (): Promise<void> => tail;
  return execute;
}
