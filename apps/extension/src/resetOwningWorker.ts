import { startChromeResetOwningAcceptance } from "./resetOwningAcceptance";
import { loadPackagedChromeResetOwningCaseText } from "./resetOwningCase";

// Separate CRX entry: fixed packaged DATA is validated before importing the one
// production composition. No page message can choose a case or invoke reset.
let active:
  Awaited<ReturnType<typeof startChromeResetOwningAcceptance>> | undefined;
const starting = (async () => {
  const text = await loadPackagedChromeResetOwningCaseText();
  active = await startChromeResetOwningAcceptance(
    text,
    async () => (await import("./background")).chromeRuntime
  );
  return active;
})();
void starting.catch(() => undefined);

// Installed synchronously so a genuine Observe-once wake can wait for startup.
// After startup the entry's identical readonly listener owns ordinary requests.
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (
    !message ||
    typeof message !== "object" ||
    !("type" in message) ||
    message.type !== "clipp-reset-owning-read" ||
    active
  )
    return;
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== chrome.runtime.getURL("reset-owning-witness.html")
  ) {
    reply({ ok: false, error: "owning_read_refused" });
    return false;
  }
  void starting.then(
    (entry) => {
      entry.handleRead(message, sender, reply);
    },
    () => reply({ ok: false, error: "owning_observation_unconfirmed" })
  );
  return true;
});
