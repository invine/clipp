import type { RuntimeAdapter, RuntimeContext } from "./contract";

export type RuntimeStatus = "idle" | "starting" | "running" | "stopping" | "stopped";

export type RuntimeOrchestration<Identity, ApplicationState, PublicState> = {
  adapter: RuntimeAdapter<Identity, ApplicationState, PublicState>;
  start(context: RuntimeContext<Identity, ApplicationState, PublicState>): void | Promise<void>;
  stop?(context: RuntimeContext<Identity, ApplicationState, PublicState>): void | Promise<void>;
};

export function createRuntimeOrchestrator<Identity, ApplicationState, PublicState>(
  orchestration: RuntimeOrchestration<Identity, ApplicationState, PublicState>
) {
  let currentStatus: RuntimeStatus = "idle";
  let unsubscribeShutdown: (() => void) | undefined;

  const publishState = async (): Promise<PublicState> => {
    const state = await orchestration.adapter.publicState.read();
    await orchestration.adapter.publicState.publish(state);
    return state;
  };
  const context: RuntimeContext<Identity, ApplicationState, PublicState> = {
    ...orchestration.adapter,
    publishState,
  };

  const stop = async (): Promise<void> => {
    if (currentStatus === "idle" || currentStatus === "stopped" || currentStatus === "stopping") return;
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
      currentStatus = "starting";
      unsubscribeShutdown = orchestration.adapter.lifecycle.onShutdown(stop);
      try {
        await orchestration.start(context);
        await publishState();
        currentStatus = "running";
      } catch (error) {
        unsubscribeShutdown();
        unsubscribeShutdown = undefined;
        currentStatus = "stopped";
        throw error;
      }
    },
    stop,
    publishState,
    status: (): RuntimeStatus => currentStatus,
    context: (): RuntimeContext<Identity, ApplicationState, PublicState> => context,
  };
}

