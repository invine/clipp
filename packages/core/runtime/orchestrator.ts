import type { RuntimeAdapter, RuntimeContext } from "./contract";
import { createOrderedStatePublisher } from "./orderedPublication";

export type RuntimeStatus =
  "idle" | "starting" | "running" | "stopping" | "stopped";

export type RuntimeOrchestration<Identity, ApplicationState, PublicState> = {
  adapter: RuntimeAdapter<Identity, ApplicationState, PublicState>;
  start(
    context: RuntimeContext<Identity, ApplicationState, PublicState>
  ): void | Promise<void>;
  stop?(
    context: RuntimeContext<Identity, ApplicationState, PublicState>
  ): void | Promise<void>;
};

export function createRuntimeOrchestrator<
  Identity,
  ApplicationState,
  PublicState,
>(
  orchestration: RuntimeOrchestration<Identity, ApplicationState, PublicState>
) {
  let currentStatus: RuntimeStatus = "idle";
  let unsubscribeShutdown: (() => void) | undefined;
  let lifecycleGeneration = 0;

  const publisher = createOrderedStatePublisher(
    orchestration.adapter.publicState
  );
  const publishState = () => publisher.request();
  const context: RuntimeContext<Identity, ApplicationState, PublicState> = {
    ...orchestration.adapter,
    publishState,
  };

  const stop = async (): Promise<void> => {
    if (
      currentStatus === "idle" ||
      currentStatus === "stopped" ||
      currentStatus === "stopping"
    )
      return;
    lifecycleGeneration++;
    currentStatus = "stopping";
    try {
      await orchestration.stop?.(context);
    } finally {
      unsubscribeShutdown?.();
      unsubscribeShutdown = undefined;
      currentStatus = "stopped";
    }
  };

  return {
    async start(): Promise<void> {
      if (currentStatus === "running" || currentStatus === "starting") return;
      const generation = ++lifecycleGeneration;
      currentStatus = "starting";
      unsubscribeShutdown = orchestration.adapter.lifecycle.onShutdown(stop);
      try {
        await orchestration.start(context);
        if (generation !== lifecycleGeneration || currentStatus !== "starting")
          return;
        await publishState();
        if (generation !== lifecycleGeneration || currentStatus !== "starting")
          return;
        currentStatus = "running";
      } catch (error) {
        if (
          generation === lifecycleGeneration &&
          currentStatus === "starting"
        ) {
          unsubscribeShutdown?.();
          unsubscribeShutdown = undefined;
          currentStatus = "stopped";
        }
        throw error;
      }
    },
    stop,
    publishState,
    status: (): RuntimeStatus => currentStatus,
    context: (): RuntimeContext<Identity, ApplicationState, PublicState> =>
      context,
  };
}
