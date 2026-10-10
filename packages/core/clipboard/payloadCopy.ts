export type PayloadCopyResult = {
  status: "copied" | "rejected" | "unconfirmed";
};

async function awaitAcknowledgement(
  request: () => Promise<PayloadCopyResult>,
  acknowledgementMs: number
): Promise<PayloadCopyResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PayloadCopyResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ status: "unconfirmed" }),
      acknowledgementMs
    );
  });
  try {
    return await Promise.race([request(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Payload writes do not reuse a retained Clip or force outbound sharing.
 * A lost acknowledgement must never trigger an automatic second write.
 */
export function copyPayloadText(
  text: string,
  write: (text: string) => Promise<void> | void,
  acknowledgementMs = 10_000
): Promise<PayloadCopyResult> {
  return awaitAcknowledgement(async () => {
    try {
      await write(text);
      return { status: "copied" };
    } catch {
      return { status: "rejected" };
    }
  }, acknowledgementMs);
}

/** A missing runtime reply is uncertainty, even when the native port may have written. */
export function confirmPayloadCopy(
  request: () => Promise<PayloadCopyResult>,
  acknowledgementMs = 10_000
): Promise<PayloadCopyResult> {
  return awaitAcknowledgement(async () => {
    try {
      const result = await request();
      return result &&
        ["copied", "rejected", "unconfirmed"].includes(result.status)
        ? result
        : { status: "unconfirmed" };
    } catch {
      return { status: "unconfirmed" };
    }
  }, acknowledgementMs);
}
