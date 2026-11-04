import React from "react";
import type { ThemePreference } from "../../core/runtime/themePreference";
import type { SettingsClientState } from "../../core/runtime/settingsClient";
import type { RuntimeSettings } from "../../core/runtime/settingsAuthority";
import {
  PreferenceRefreshNotice,
  PreferenceSaveFeedback,
} from "./PreferenceSaveFeedback";
export type AppearanceSettings = SettingsClientState;
export function Appearance({
  settings,
  onSave,
  onRefresh,
}: {
  settings: AppearanceSettings;
  onSave?(patch: Partial<RuntimeSettings>): void | Promise<void>;
  onRefresh?(): void | Promise<void>;
}) {
  return (
    <div className="appearance-settings">
      <label>
        Appearance
        <select
          aria-label="Appearance"
          value={settings.snapshot?.state.theme ?? ""}
          disabled={!settings.snapshot || settings.recoveryRequired || !onSave}
          aria-disabled={settings.pending || undefined}
          aria-busy={settings.pending || undefined}
          onChange={(event) => {
            if (settings.pending) {
              event.currentTarget.value = settings.snapshot?.state.theme ?? "";
              return;
            }
            void onSave?.({
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
        onRetry={onRefresh}
      />
      {settings.recoveryRequired && (
        <button
          type="button"
          disabled={settings.refreshing || !onRefresh}
          onClick={() => void onRefresh?.()}
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
