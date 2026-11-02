import { useEffect, useLayoutEffect, useState } from "react";
import { createSettingsClient } from "../../core/runtime/settingsClient";
import type { ThemePreference } from "../../core/runtime/themePreference";

export function useDocumentTheme(theme: ThemePreference | undefined) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.clippTheme = theme ?? "system";
    return () => {
      delete root.dataset.clippTheme;
    };
  }, [theme]);
}

export function useRuntimeSettings(
  port: Parameters<typeof createSettingsClient>[0]
) {
  const [client] = useState(() => createSettingsClient(port));
  const [state, setState] = useState(client.getState);
  useEffect(() => {
    void client.start(setState);
    return () => client.stop();
  }, [client]);
  useDocumentTheme(state.snapshot?.state.theme);
  return { ...state, save: client.save, refresh: client.refresh };
}
