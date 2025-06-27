import React, { useEffect, useState } from "react";

export type Clip = {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  senderId: string;
};

export const ClipHistoryList = () => {
  const [history, setHistory] = useState([] as Clip[]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let isMounted = true;
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "getClipHistory" }, (resp) => {
      if (isMounted) setHistory(resp?.clips || []);
    });
    // Listen for newClip events to update history in real time
    // @ts-ignore
    const handler = (msg) => {
      if (msg.type === "newClip") {
        setHistory((prev) => [msg.clip, ...prev.filter((c) => c.id !== msg.clip.id)]);
      }
    };
    // @ts-ignore
    chrome.runtime.onMessage.addListener(handler);
    return () => {
      isMounted = false;
      // @ts-ignore
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, []);

  function handleSearch(e: any) {
    setQuery(e.target.value);
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "searchClipHistory", query: e.target.value }, (resp) => {
      setHistory(resp?.clips || []);
    });
  }

  return (
    <div>
      <input
        className="w-full mb-2 px-2 py-1 border rounded"
        placeholder="Search history..."
        value={query}
        onChange={handleSearch}
      />
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {history.length === 0 && <div className="text-gray-400">(No history)</div>}
        {history.map((clip) => (
          <div key={clip.id} className="bg-gray-100 dark:bg-gray-800 rounded p-2 text-xs">
            <div className="truncate mb-1">
              {clip.type === "text"
                ? <span title={clip.content}>{clip.content.length > 200 ? clip.content.slice(0, 200) + '…' : clip.content}</span>
                : clip.type === "image"
                ? <img src={`data:image/png;base64,${clip.content}`} alt="Clipboard" className="max-h-12 inline-block" />
                : `[${clip.type}]`}
            </div>
            <div className="text-gray-400">{new Date(clip.timestamp).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
