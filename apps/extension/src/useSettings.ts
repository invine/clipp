import { useEffect, useState } from "react";
import { createSettingsClient } from "./settingsClient";

function createChromeSettingsClient() {
  return createSettingsClient({
    send: (message) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      }),
    subscribe: (listener) => {
      const onMessage = (message: unknown) => {
        listener(message);
      };
      chrome.runtime.onMessage.addListener(onMessage);
      return () => chrome.runtime.onMessage.removeListener(onMessage);
    },
  });
}

export function useSettings() {
  const [client] = useState(createChromeSettingsClient);
  const [state, setState] = useState(client.getState);
  useEffect(() => {
    void client.start(setState);
    return () => client.stop();
  }, [client]);
  return { ...state, save: client.save, refresh: client.refresh };
}
