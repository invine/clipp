import React from "react";
import type { ThemePreference } from "../../core/runtime/themePreference";
import type { useRuntimeSettings } from "./useRuntimeSettings";
import {
  PreferenceRefreshNotice,
  PreferenceSaveFeedback,
} from "./PreferenceSaveFeedback";
export type AppearanceSettings = ReturnType<typeof useRuntimeSettings>;
export function Appearance({ settings }: { settings: AppearanceSettings }) {
  return (
    <div className="appearance-settings">
      <label>
        Appearance
        <select
          aria-label="Appearance"
          value={settings.snapshot?.state.theme ?? ""}
          disabled={
            !settings.snapshot || settings.pending || settings.recoveryRequired
          }
          onChange={(event) => {
            void settings.save({
              theme: event.target.value as ThemePreference,
            });
          }}
        >
          {!settings.snapshot && <option value="">Unknown</option>}
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      {settings.loading && <p role="status">Loading appearance…</p>}
      {settings.pending && settings.pendingFields?.includes("theme") && (
        <p role="status">Saving appearance…</p>
      )}
      <PreferenceRefreshNotice
        subject="Appearance"
        error={settings.refreshError}
        onRetry={settings.refresh}
      />
      {settings.recoveryRequired && (
        <button
          type="button"
          disabled={settings.refreshing}
          onClick={() => void settings.refresh()}
        >
          Refresh appearance
        </button>
      )}
      <PreferenceSaveFeedback
        subject="Appearance"
        feedback={
          settings.feedback?.fields?.includes("theme")
            ? settings.feedback
            : null
        }
        refreshError={settings.refreshError}
        refreshing={settings.refreshing}
      />
    </div>
  );
}
