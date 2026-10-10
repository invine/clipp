import React, { useEffect, useState } from "react";
import type { PendingRequest } from "../../../../packages/ui/src/types";
import { decideExtensionPairing } from "../pairingActions";
import { pairingApprovalMessage } from "../../../../packages/core/pairing/results";

export const TrustPrompt = () => {
  const [requests, setRequests] = useState<PendingRequest[]>([]);

  useEffect(() => {
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "getPendingRequests" }, (res) => {
      setRequests(res || []);
    });
  }, []);

  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  async function respond(dev: PendingRequest, accept: boolean) {
    if (busy) return;
    setBusy(dev.deviceId);
    const result = await decideExtensionPairing(chrome.runtime, dev, accept);
    setFeedback(pairingApprovalMessage(result, accept));
    chrome.runtime.sendMessage({ type: "getPendingRequests" }, (res) =>
      setRequests(res || [])
    );
    setBusy(null);
  }

  if (requests.length === 0 && !feedback) return null;

  return (
    <div className="bg-yellow-100 p-2 rounded text-sm mb-2">
      {feedback && <p role="status">{feedback}</p>}
      {requests.map((r) => (
        <div
          key={r.deviceId}
          className="flex justify-between items-center mb-1"
        >
          <span className="truncate mr-2" title={r.deviceName}>
            {r.deviceName}
          </span>
          <div className="space-x-1">
            <button
              className="text-xs text-blue-600"
              disabled={busy !== null}
              onClick={() => void respond(r, true)}
            >
              Accept
            </button>
            <button
              className="text-xs text-red-600"
              disabled={busy !== null}
              onClick={() => void respond(r, false)}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
