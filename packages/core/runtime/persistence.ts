import type { KVStorageBackend } from "../trust";
import type {
  RuntimeApplicationState,
  RuntimeIdentityStorage,
  RuntimeTransaction,
} from "./contract";

export function createKVRuntimeIdentityStorage<Identity>(options: {
  storage: KVStorageBackend;
  key: string;
}): RuntimeIdentityStorage<Identity> {
  return {
    load: () => options.storage.get<Identity>(options.key),
    save: (identity) => options.storage.set(options.key, identity),
    clear: () => options.storage.remove(options.key),
  };
}

export function createKVRuntimeApplicationState<State>(options: {
  storage: KVStorageBackend;
  key: string;
  initialState: () => State;
}): RuntimeApplicationState<State> {
  return createSerializedRuntimeApplicationState({
    read: async () => {
      const stored = await options.storage.get<State>(options.key);
      return stored ?? options.initialState();
    },
    write: (state) => options.storage.set(options.key, state),
  });
}

export function createSerializedRuntimeApplicationState<State>(options: {
  read(): Promise<State>;
  write(state: State): Promise<void>;
}): RuntimeApplicationState<State> {
  let queue: Promise<void> = Promise.resolve();

  return {
    async read() {
      await queue;
      return clone(await options.read());
    },
    async transact<Result>(
      update: (state: State) => RuntimeTransaction<State, Result> | Promise<RuntimeTransaction<State, Result>>
    ) {
      let result!: Result;
      const operation = queue.then(async () => {
        const transaction = await update(clone(await options.read()));
        await options.write(clone(transaction.state));
        result = transaction.result;
      });
      queue = operation.then(
        () => undefined,
        () => undefined
      );
      await operation;
      return result;
    },
  };
}

function clone<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
