import {
  parseChromeResetOwningCase,
  loadPackagedChromeResetOwningCaseText,
} from "./resetOwningCase";

// Page memory only. No storage, clipboard, reset control, download or collector.
const status = document.querySelector<HTMLElement>("#status")!;
const output = document.querySelector<HTMLTextAreaElement>("#evidence")!;
const chunks: string[] = [];
let chunkIndex = 0,
  bytes = 0,
  cursor = 0,
  worker = "",
  busy = false;
let timer: ReturnType<typeof setInterval> | undefined;
const pause = () => {
  clearInterval(timer);
  timer = undefined;
};
const display = () => {
  output.value = chunks[chunkIndex] ?? "";
  status.textContent = `Paused: chunk ${chunks.length ? chunkIndex + 1 : 0}/${chunks.length}. Export all chunks before context retirement.`;
};
void (async () => {
  try {
    const text = await loadPackagedChromeResetOwningCaseText();
    const rootCase = parseChromeResetOwningCase(text);
    if (rootCase.extensionId !== chrome.runtime.id)
      throw Error("wrong_extension");
    const started = performance.now(),
      lifetime = rootCase.deadlineUnixMs - Date.now();
    const current = () =>
      Date.now() < rootCase.deadlineUnixMs &&
      performance.now() - started < lifetime;
    const request = (command: "read" | "observe-once", at?: number) =>
      chrome.runtime.sendMessage({
        type: "clipp-reset-owning-read",
        caseId: rootCase.caseId,
        command,
        ...(command === "read" ? { cursor: at } : {}),
      });
    const observe = async () => {
      if (busy) return;
      busy = true;
      try {
        if (!current()) throw Error("expired");
        const observed = await request("observe-once");
        if (!current() || observed?.ok !== true)
          throw Error("observation_unconfirmed");
        // First read determines the actual worker incarnation without copying any
        // unrecognized response into the DOM. Native restart evidence is external.
        const initial = await request("read", 0);
        const head = initial?.value;
        if (
          initial?.ok !== true ||
          head?.caseId !== rootCase.caseId ||
          typeof head.workerIncarnation !== "string" ||
          !/^[a-f0-9-]{36}$/.test(head.workerIncarnation)
        )
          throw Error("observation_unconfirmed");
        if (worker !== head.workerIncarnation) {
          worker = head.workerIncarnation;
          cursor = 0;
        }
        const reply = cursor === 0 ? initial : await request("read", cursor);
        const value = reply?.value;
        if (
          !current() ||
          reply?.ok !== true ||
          value?.caseId !== rootCase.caseId ||
          value.workerIncarnation !== worker ||
          value.failed !== false ||
          !Number.isSafeInteger(value.nextCursor) ||
          !Number.isSafeInteger(value.totalRows) ||
          value.nextCursor < cursor ||
          value.totalRows > 256 ||
          !Array.isArray(value.rows) ||
          value.rows.length > 4 ||
          value.rows.some(
            (row: unknown) =>
              !row ||
              typeof row !== "object" ||
              Object.values(row).some(
                (field) =>
                  !["string", "number", "boolean"].includes(typeof field)
              )
          )
        )
          throw Error("observation_unconfirmed");
        if (value.rows.length) {
          const encoded = JSON.stringify({
            version: 1,
            caseId: rootCase.caseId,
            workerIncarnation: worker,
            fromCursor: cursor,
            nextCursor: value.nextCursor,
            totalRows: value.totalRows,
            rows: value.rows,
          });
          const size = new TextEncoder().encode(encoded).length;
          if (size > 32768 || chunks.length >= 64 || bytes + size > 2097152)
            throw Error("page_cap");
          chunks.push(encoded);
          bytes += size;
          cursor = value.nextCursor;
          chunkIndex = chunks.length - 1;
          display();
        }
      } catch {
        pause();
        status.textContent =
          "Unconfirmed. Preserve existing chunks; no native pass is implied.";
      } finally {
        busy = false;
      }
    };
    document.querySelector("#observe")!.addEventListener("click", () => {
      pause();
      void observe();
    });
    document.querySelector("#collect")!.addEventListener("click", () => {
      if (!timer) {
        void observe();
        timer = setInterval(() => {
          void observe();
        }, 1000);
      }
    });
    document.querySelector("#pause")!.addEventListener("click", () => {
      pause();
      display();
    });
    document.querySelector("#previous")!.addEventListener("click", () => {
      pause();
      chunkIndex = Math.max(0, chunkIndex - 1);
      display();
    });
    document.querySelector("#next")!.addEventListener("click", () => {
      pause();
      chunkIndex = Math.min(chunks.length - 1, chunkIndex + 1);
      display();
    });
    setTimeout(
      () => {
        pause();
        status.textContent =
          "Original case deadline expired. Preserve all chunks; further collection refused.";
      },
      Math.max(0, lifetime)
    );
  } catch {
    status.textContent =
      "Root case unavailable or invalid. No observation started.";
  }
})();
