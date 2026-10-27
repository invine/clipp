/** The only additional history allowed after the native overlap is its known fresh local Clip. */
export function resetOverlapHistoryAccepted(
  clips: readonly { content: string; originPeerId: string }[],
  caseId: string,
  currentPeerId: string
): boolean {
  return clips.length === 0 || (clips.length === 1 &&
    clips[0].content === `clipp-reset-${caseId}-after-send` &&
    clips[0].originPeerId === currentPeerId);
}
