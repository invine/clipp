import { useEffect, useState } from "react";
import { createHistoryClient } from "./historyClient";

function createChromeHistoryClient() {
  return createHistoryClient({
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
      const onMessage = (message: unknown) => listener(message);
      chrome.runtime.onMessage.addListener(onMessage);
      return () => chrome.runtime.onMessage.removeListener(onMessage);
    },
  });
}

export function useHistory() {
  const [client] = useState(createChromeHistoryClient);
  const [state, setState] = useState(client.getState);
  useEffect(() => {
    void client.start(setState);
    return () => client.stop();
  }, [client]);
  return { ...state, refresh: client.refresh };
}
