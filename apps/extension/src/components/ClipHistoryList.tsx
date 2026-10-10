import React, { useState } from "react";
import { useHistory } from "../useHistory";

export const ClipHistoryList = () => {
  const [query, setQuery] = useState("");
  const history = useHistory();
  const clips = history.snapshot?.clips ?? [];
  const visible = clips.filter((clip) =>
    clip.content.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div>
      <input
        className="w-full mb-2 px-2 py-1 border rounded"
        placeholder="Search history..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {history.loading && <p role="status">Loading History…</p>}
      {history.refreshError && (
        <div role="alert">
          <span>
            {history.snapshot
              ? "History refresh failed. Showing last known Clips."
              : "History unavailable."}
          </span>
          <button type="button" onClick={() => void history.refresh()}>
            Retry
          </button>
        </div>
      )}
      {!history.loading &&
        history.snapshot &&
        !history.refreshError &&
        clips.length === 0 && <p>No history yet.</p>}
      {!history.loading &&
        history.snapshot &&
        clips.length > 0 &&
        visible.length === 0 && <p>No Clips match this search.</p>}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {visible.map((clip) => (
          <div
            key={clip.id}
            className="bg-gray-100 dark:bg-gray-800 rounded p-2 text-xs"
          >
            <div className="truncate mb-1">
              {clip.type === "text" ? (
                <span title={clip.content}>
                  {clip.content.length > 200
                    ? clip.content.slice(0, 200) + "…"
                    : clip.content}
                </span>
              ) : (
                <a
                  href={clip.content}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {clip.content}
                </a>
              )}
            </div>
            <div className="text-gray-400">
              {new Date(clip.capturedAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
