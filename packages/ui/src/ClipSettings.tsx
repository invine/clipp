import React, { useRef } from "react";
import type { AppearanceSettings } from "./Appearance";
import { usePreferenceRecoveryBehavior } from "./preferenceRecoveryBehavior";
import type { RuntimeSettings } from "../../core/runtime/settingsAuthority";
import {
  PreferenceRefreshNotice,
  PreferenceSaveFeedback,
} from "./PreferenceSaveFeedback";

const day = 86400000;
function DurationSelect({
  label,
  value,
  values,
  disabled,
  pending,
  onChange,
}: {
  label: string;
  value: number | undefined;
  values: Array<[number, string]>;
  disabled: boolean;
  pending: boolean;
  // eslint-disable-next-line no-unused-vars
  onChange(value: number): void;
}) {
  const custom =
    value !== undefined && !values.some(([preset]) => preset === value);
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value ?? ""}
        disabled={disabled}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        onChange={(event) => {
          if (pending) {
            event.currentTarget.value = String(value ?? "");
            return;
          }
          onChange(Number(event.target.value));
        }}
      >
        {value === undefined && <option value="">Unknown</option>}
        {custom && <option value={value}>Custom ({value} ms)</option>}
        {values.map(([duration, text]) => (
          <option key={duration} value={duration}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
/** Both settings use the runtime's applied ordered snapshot, including partial cleanup effects. */
export function ClipSettings({
  settings,
  owner,
  onRetryRetention,
  onSave,
  onRefresh,
  section = "both",
}: {
  settings: AppearanceSettings;
  owner?: object;
  section?: "retention" | "lifetime" | "both";
  onRetryRetention?(): Promise<void>;
  onSave?(patch: Partial<RuntimeSettings>): void | Promise<void>;
  onRefresh?(): void | Promise<void>;
}) {
  const localOwner = useRef<object>({});
  const recovery = usePreferenceRecoveryBehavior(owner ?? localOwner.current);
  const retrying = recovery.pending;
  const retryError = recovery.error;
  const applied = settings.snapshot?.state;
  const disabled = !applied || settings.recoveryRequired;
  const belongsToSection = (field: string) =>
    (field === "localRetentionMs" && section !== "lifetime") ||
    (field === "sharingLifetimeMs" && section !== "retention");
  const feedback = settings.feedback?.fields?.some(belongsToSection)
    ? settings.feedback
    : null;
  const retry = () =>
    recovery.run(async () => {
      if (!onRetryRetention) return;
      await onRetryRetention();
      await onRefresh?.();
    });
  return (
    <div className="clip-settings relay-settings">
      {section !== "lifetime" && (
        <>
          <DurationSelect
            label="Keep unpinned history"
            value={applied?.localRetentionMs}
            values={[
              [0, "Remove unpinned history immediately"],
              [7 * day, "7 days"],
              [30 * day, "30 days (default)"],
              [90 * day, "90 days"],
              [365 * day, "365 days (maximum)"],
            ]}
            disabled={disabled || !onSave}
            pending={settings.pending}
            onChange={(value) => {
              void onSave?.({ localRetentionMs: value });
            }}
          />
          <p className="peer-sub">
            Applies immediately to existing unpinned history. Pins are exempt.
            Removed history cannot be restored by increasing this period.
          </p>
        </>
      )}
      {section !== "retention" && (
        <>
          <DurationSelect
            label="Clip Sharing Lifetime"
            value={applied?.sharingLifetimeMs}
            values={[
              [3600000, "1 hour"],
              [day, "24 hours (default)"],
              [7 * day, "7 days"],
              [30 * day, "30 days (maximum)"],
            ]}
            disabled={disabled || !onSave}
            pending={settings.pending}
            onChange={(value) => {
              void onSave?.({ sharingLifetimeMs: value });
            }}
          />
          <p className="peer-sub">
            Applies to new Clips only. Expiry stops sharing; it does not delete
            local history. Existing and imported Clips keep their original
            deadlines.
          </p>
        </>
      )}
      {section !== "lifetime" && applied?.retentionError && (
        <p role="alert">
          The applied history policy is shown above, but cleanup or saving needs
          recovery: {applied.retentionError}. Any completed cleanup remains in
          effect.
        </p>
      )}
      {section !== "lifetime" &&
        applied?.retentionError &&
        onRetryRetention && (
          <button
            type="button"
            disabled={retrying || settings.pending}
            onClick={() => {
              void retry();
            }}
          >
            {retrying ? "Retrying history policy…" : "Retry history policy"}
          </button>
        )}
      {retryError && (
        <p role="alert">History policy recovery failed: {retryError}</p>
      )}
      {settings.pending && settings.pendingFields?.some(belongsToSection) && (
        <p role="status">Saving Clip settings…</p>
      )}
      <PreferenceRefreshNotice
        subject="Clip settings"
        error={settings.refreshError}
        onRetry={onRefresh}
      />
      <PreferenceSaveFeedback
        subject="Clip settings"
        feedback={feedback}
        refreshError={settings.refreshError}
        refreshing={settings.refreshing}
      />
      {settings.recoveryRequired && (
        <button
          type="button"
          disabled={settings.refreshing || !onRefresh}
          onClick={() => {
            void onRefresh?.();
          }}
        >
          Refresh Clip settings
        </button>
      )}
    </div>
  );
}
