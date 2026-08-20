import type { ClipHistoryStore } from "../history/store";
import type { Clip } from "../models/Clip";
import type { ClipboardService } from "./service";

export type ReuseRetainedClipDependencies = {
  history: Pick<ClipHistoryStore, "getById">;
  clipboard: Pick<ClipboardService, "reuseLocalClip">;
};

export async function reuseRetainedClip(
  id: string,
  dependencies: ReuseRetainedClipDependencies,
): Promise<Clip | null> {
  const item = await dependencies.history.getById(id);
  if (!item) throw new Error("clip_not_found");
  return await dependencies.clipboard.reuseLocalClip(item.clip);
}
