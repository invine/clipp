/* global chrome */
import React, { useEffect, useState } from "react";

// Add TypeScript declaration for chrome
declare const chrome: typeof globalThis.chrome;

export type ClipPreviewProps = {
  clip: {
    type: "text" | "url";
    content: string;
    id: string;
    originPeerId: string;
    capturedAt: number;
    shareExpiresAt: number;
  } | null;
};

export const ClipPreview = ({ clip }: ClipPreviewProps) => {
  if (!clip) {
    return (
      <div className="rounded bg-gray-100 dark:bg-gray-800 p-2 min-h-[48px] flex items-center justify-center">
        <span className="text-gray-700 dark:text-gray-200">(No clip loaded)</span>
      </div>
    );
  }
  if (clip.type === "url") {
    return (
      <a href={clip.content} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
        {clip.content}
      </a>
    );
  }
  // Default: text
  return (
    <div className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">
      {clip.content}
    </div>
  );
};

// Hook to get latest clip from background
export function useLatestClip() {
  const [clip, setClip] = useState(null as ClipPreviewProps["clip"]);
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "getLatestClip" }, (resp) => {
      setClip(resp?.clip || null);
    });
    // Listen for newClip events
    const handler = (msg: any) => {
      if (msg.type === "newClip") setClip(msg.clip);
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);
  return clip;
}
