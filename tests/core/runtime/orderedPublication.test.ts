import { createOrderedStatePublisher } from "../../../packages/core/runtime/orderedPublication";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("ordered public state publication", () => {
  it("does not publish a delayed read after a newer invalidation", async () => {
    const first = deferred<string>();
    const read = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue("current");
    const published: string[] = [];
    const publisher = createOrderedStatePublisher<string>({
      read,
      publish: async (state) => {
        published.push(state);
      },
    });

    const stale = publisher.request();
    await Promise.resolve();
    const current = publisher.request();
    first.resolve("old");
    await Promise.all([stale, current]);

    expect(published).toEqual(["current"]);
  });
});
