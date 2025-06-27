import React from "react";

export type ShareButtonProps = {
  clip: {
    type: string;
    content: string;
    id: string;
    timestamp: number;
    senderId: string;
  } | null;
  onShare: () => void;
  disabled?: boolean;
};

export const ShareButton = ({ clip, onShare, disabled }: ShareButtonProps) => (
  <button
    className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 mb-3 disabled:opacity-50"
    onClick={onShare}
    disabled={!clip || disabled}
    title={!clip ? "No clipboard content to share" : "Share clipboard with peers"}
  >
    Share Now
  </button>
);
