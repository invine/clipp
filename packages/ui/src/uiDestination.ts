/** Navigation data only; runtime authorization remains with the host. */
export type HistoryContext = {
  search?: string;
  sourceFilter?: string;
  filterMode?: "all" | "pinned" | "links";
};
export type UiDestination =
  | {
      kind: "history";
      context?: HistoryContext;
    }
  | { kind: "clip-details"; entity: string; context?: HistoryContext }
  | { kind: "requests"; entity?: string }
  | { kind: "pairing" }
  | { kind: "devices" }
  | {
      kind: "settings";
      category?:
        | "general"
        | "connections"
        | "advanced"
        | "appearance"
        | "clips"
        | "relays";
    };
export function parseUiDestination(value: unknown): UiDestination | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(v, "kind")) return null;
  const allowed =
    v.kind === "history"
      ? ["kind", "context"]
      : v.kind === "clip-details"
        ? ["kind", "entity", "context"]
        : v.kind === "requests"
          ? ["kind", "entity"]
          : v.kind === "settings"
            ? ["kind", "category"]
            : ["kind"];
  if (Object.keys(v).some((key) => !allowed.includes(key))) return null;
  if (
    ![
      "history",
      "clip-details",
      "requests",
      "pairing",
      "devices",
      "settings",
    ].includes(String(v.kind))
  )
    return null;
  const identifier = (v: unknown) =>
    typeof v === "string" &&
    v.length > 0 &&
    v.length <= 256 &&
    /^[a-zA-Z0-9_-]+$/.test(v);
  if (v.kind === "clip-details" && !identifier(v.entity)) return null;
  if (v.entity !== undefined && !identifier(v.entity)) return null;
  if (
    v.category !== undefined &&
    ![
      "general",
      "connections",
      "advanced",
      "appearance",
      "clips",
      "relays",
    ].includes(String(v.category))
  )
    return null;
  if (v.context !== undefined) {
    if (!v.context || typeof v.context !== "object" || Array.isArray(v.context))
      return null;
    const c = v.context as Record<string, unknown>;
    if (
      Object.keys(c).some(
        (k) =>
          !["search", "timeFilter", "sourceFilter", "filterMode"].includes(k)
      )
    )
      return null;
    if (
      c.search !== undefined &&
      (typeof c.search !== "string" || c.search.length > 256)
    )
      return null;
    if (c.sourceFilter !== undefined && !identifier(c.sourceFilter))
      return null;
    if (
      c.timeFilter !== undefined &&
      !["all", "24h", "7d", "30d"].includes(String(c.timeFilter))
    )
      return null;
    if (
      c.filterMode !== undefined &&
      !["all", "pinned", "links"].includes(String(c.filterMode))
    )
      return null;
  }
  // One canonical field order makes duplicate handoffs compare by validated data.
  const normalized: Record<string, unknown> = { kind: v.kind };
  for (const key of ["entity", "category"])
    if (v[key] !== undefined) normalized[key] = v[key];
  if (v.context !== undefined) {
    const incoming = v.context as Record<string, unknown>,
      context: Record<string, unknown> = {};
    for (const key of ["search", "sourceFilter", "filterMode"])
      if (incoming[key] !== undefined) context[key] = incoming[key];
    normalized.context = context;
  }
  return normalized as UiDestination;
}
export function sameUiDestination(a: UiDestination, b: UiDestination) {
  return (
    a.kind === b.kind &&
    ("entity" in a ? a.entity : undefined) ===
      ("entity" in b ? b.entity : undefined) &&
    ("category" in a ? a.category : undefined) ===
      ("category" in b ? b.category : undefined)
  );
}
