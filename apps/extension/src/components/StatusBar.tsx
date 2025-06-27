import React from "react";

export type StatusBarProps = {
  peerCount: number;
  connected: boolean;
  syncEnabled: boolean;
  onToggleSync: (enabled: boolean) => void;
};

export const StatusBar = ({ peerCount, connected, syncEnabled, onToggleSync }: StatusBarProps) => (
  <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
    <span>Peers: {peerCount}</span>
    <span className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-400"} inline-block`}></span>
      {connected ? "Connected" : "Disconnected"}
    </span>
    <label className="flex items-center gap-1 cursor-pointer">
      <input
        type="checkbox"
        className="accent-blue-600"
        checked={syncEnabled}
        onChange={e => onToggleSync(e.target.checked)}
      />
      <span>Sync</span>
    </label>
  </div>
);
