/** Acceptance-only, exact-import resolver; ordinary Vite config does not load this. */
export function resetOverlapAlias(client: string, acceptancePorts: string) {
  const seen = new Set<string>();
  const resolve = (source: string, importer: string | undefined): string | null => {
    if (importer !== client) return null;
    if (source !== "./backgroundContinuityNative" && source !== "./identityResetRuntime") return null;
    seen.add(source);
    return acceptancePorts;
  };
  resolve.verify = () => {
    if (!seen.has("./backgroundContinuityNative") || !seen.has("./identityResetRuntime"))
      throw new Error("overlap_alias_missing");
  };
  return resolve;
}
