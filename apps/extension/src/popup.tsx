import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles/tailwind.css";
import { ClipPreview } from "./components/ClipPreview";
import { ShareButton } from "./components/ShareButton";
import { StatusBar } from "./components/StatusBar";
import { TrustPrompt } from "./components/TrustPrompt";

function useLatestClip() {
  const [clip, setClip] = useState(null);
  useEffect(() => {
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "getLatestClip" }, (resp) => {
      setClip(resp?.clip || null);
    });
    // @ts-ignore
    const handler = (msg) => {
      if (msg.type === "newClip") setClip(msg.clip);
    };
    // @ts-ignore
    chrome.runtime.onMessage.addListener(handler);
    // @ts-ignore
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);
  return clip;
}

function usePeerStatus() {
  const [peerCount, setPeerCount] = useState(0);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "getPeerStatus" }, (resp) => {
      setPeerCount(resp?.peerCount || 0);
      setConnected(!!resp?.connected);
    });
    // Optionally, poll or listen for peer status updates
  }, []);
  return { peerCount, connected };
}

function useSyncToggle(): [boolean, (val: boolean) => void] {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    // @ts-ignore
    chrome.storage.local.get(["autoSync"], (res) => {
      setEnabled(res.autoSync !== false);
    });
  }, []);
  const toggle = (val: boolean) => {
    setEnabled(val);
    // @ts-ignore
    chrome.storage.local.set({ autoSync: val });
  };
  return [enabled, toggle];
}

function handleShare(clip: any) {
  // @ts-ignore
  chrome.runtime.sendMessage({ type: "shareClip", clip });
}

const Popup = () => {
  const clip = useLatestClip();
  const { peerCount, connected } = usePeerStatus();
  const [syncEnabled, setSyncEnabled] = useSyncToggle();
  return (
    <div className="p-4 w-80">
      <TrustPrompt />
      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">Current Clipboard</div>
        <ClipPreview clip={clip} />
      </div>
      <ShareButton clip={clip} onShare={() => handleShare(clip)} />
      <StatusBar
        peerCount={peerCount}
        connected={connected}
        syncEnabled={syncEnabled}
        onToggleSync={setSyncEnabled}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<Popup />);
