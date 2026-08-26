import type { ClipHistoryStore } from "../history/store";
import type { ClipboardService, ReuseLocalClipOutcome } from "./service";

export type ReuseRetainedClipDependencies = {
  history: Pick<ClipHistoryStore, "getById">;
  clipboard: Pick<ClipboardService, "reuseLocalClip">;
};

export async function reuseRetainedClip(
  id: string,
  dependencies: ReuseRetainedClipDependencies,
): Promise<ReuseLocalClipOutcome> {
  const item = await dependencies.history.getById(id);
  if (!item) throw new Error("clip_not_found");
  return await dependencies.clipboard.reuseLocalClip(item.clip);
}
