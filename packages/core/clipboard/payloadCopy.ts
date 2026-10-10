export type PayloadCopyResult = {
  status: "copied" | "rejected" | "unconfirmed";
};

/** Payload writes do not reuse a retained Clip or force outbound sharing.
 * A lost acknowledgement must never trigger an automatic second write.
 */
export async function copyPayloadText(
  text: string,
  write: (text: string) => Promise<void> | void,
  acknowledgementMs = 10_000
): Promise<PayloadCopyResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PayloadCopyResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ status: "unconfirmed" }),
      acknowledgementMs
    );
  });
  const attempt = (async (): Promise<PayloadCopyResult> => {
    try {
      await write(text);
      return { status: "copied" };
    } catch {
      return { status: "rejected" };
    }
  })();
  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** A missing runtime reply is uncertainty, even when the native port may have written. */
export async function confirmPayloadCopy(
  request: () => Promise<PayloadCopyResult>,
  acknowledgementMs = 10_000
): Promise<PayloadCopyResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PayloadCopyResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ status: "unconfirmed" }),
      acknowledgementMs
    );
  });
  const reply = (async (): Promise<PayloadCopyResult> => {
    try {
      const result = await request();
      return result &&
        ["copied", "rejected", "unconfirmed"].includes(result.status)
        ? result
        : { status: "unconfirmed" };
    } catch {
      return { status: "unconfirmed" };
    }
  })();
  try {
    return await Promise.race([reply, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
