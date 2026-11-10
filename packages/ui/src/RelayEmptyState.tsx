import React from "react";

export function RelayEmptyState({
  onAdd,
  disabled = false,
}: {
  onAdd(): void;
  disabled?: boolean;
}) {
  return (
    <div className="relay-empty-prompt">
      <h3>No relays configured</h3>
      <p>
        Add a relay to help your devices connect when a direct connection isn’t
        available.
      </p>
      <button
        type="button"
        className="relay-empty-add"
        data-session-focus="relay:empty-add"
        onClick={onAdd}
        disabled={disabled}
      >
        + Add relay
      </button>
    </div>
  );
}
