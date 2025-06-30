import { Clip } from "../models/Clip";
import { HistoryItem } from "../models/HistoryItem";

export function byType(type?: Clip["type"]) {
  return (item: HistoryItem) => !type || item.clip.type === type;
}

export function bySearch(search?: string) {
  return (item: HistoryItem) =>
    !search || item.clip.content.toLowerCase().includes(search.toLowerCase());
}

export function bySince(since?: number) {
  return (item: HistoryItem) => !since || item.clip.timestamp >= since;
}
