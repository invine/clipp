import { Clip } from "../models/Clip";
import { ClipType } from "../models/enums";
import * as log from "../logger";

export type ClipboardWriteFn = (text: string) => Promise<void>;

export interface ClipboardWriter {
  write(clip: Clip): Promise<void>;
}

export function createWriter(fn: ClipboardWriteFn): ClipboardWriter {
  return {
    async write(clip: Clip) {
      if (clip.type === ClipType.Text || clip.type === ClipType.Url) {
        log.debug("Writing clip to clipboard");
        await fn(clip.content);
      }
    },
  };
}
