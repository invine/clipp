import React, { useRef } from "react";
import jsQR from "jsqr";

export type QRScannerProps = {
  onScan: (payload: string) => void;
};

export const QRScanner = ({ onScan }: QRScannerProps) => {
  const inputRef = useRef(null);

  function handleFileChange(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (typeof ev.target?.result === 'string') {
        // Create an Image to decode QR
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, img.width, img.height);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          const qr = jsQR(imageData.data, img.width, img.height);
          if (qr && qr.data) {
            onScan(qr.data);
          } else {
            alert("No QR code found in image.");
          }
        };
        img.onerror = () => alert("Failed to load image for QR scan.");
        img.src = ev.target.result;
      }
    };
    reader.readAsDataURL(file);
  }

  function handlePasteFromClipboard() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then((text) => {
        if (text) {
          onScan(text);
        } else {
          alert("Clipboard is empty or does not contain text.");
        }
      }).catch(() => {
        alert("Failed to read clipboard. Grant clipboard permissions and try again.");
      });
    } else {
      alert("Clipboard API not supported in this browser.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 mt-2">
      <label className="text-xs text-gray-500">Scan QR from image:</label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="block"
        onChange={handleFileChange}
        capture="environment"
      />
      <button
        type="button"
        className="mt-2 px-3 py-1 bg-blue-600 text-white rounded"
        onClick={handlePasteFromClipboard}
      >
        Paste QR/Text from Clipboard
      </button>
    </div>
  );
};
