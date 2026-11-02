import { useRuntimeSettings } from "../../../packages/ui/src/useRuntimeSettings";
export function useSettings() {
  return useRuntimeSettings({
    send: (message) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError)
            reject(new Error(chrome.runtime.lastError.message));
          else resolve(response);
        });
      }),
    subscribe: (listener) => {
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    },
  });
}
