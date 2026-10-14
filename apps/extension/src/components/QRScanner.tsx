import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export type QRScannerProps = {
  onScan(payload: string): Promise<void>;
  disabled?: boolean;
};

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(
        new Error(
          "Unable to read this file. Choose it again or paste pairing text."
        )
      );
    reader.onabort = () =>
      reject(new Error("File read cancelled. Choose a file again."));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unable to read this file."));
    reader.readAsDataURL(file);
  });
}

export const QRScanner = ({ onScan, disabled = false }: QRScannerProps) => {
  const active = useRef(false);
  const mounted = useRef(true),
    disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const retryAction = useRef<(() => Promise<string>) | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<string>) {
    if (disabled || active.current) return;
    retryAction.current = action;
    active.current = true;
    setPending(true);
    setError(null);
    try {
      const payload = await action();
      if (!mounted.current || disabledRef.current) return;
      await onScan(payload);
    } catch (failure) {
      if (!mounted.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to import pairing text. Try again."
      );
    } finally {
      active.current = false;
      if (mounted.current) setPending(false);
    }
  }
  async function decodeFile(file: File): Promise<string> {
    const url = await readDataUrl(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(
          new Error(
            "Unable to load this image. Choose another file or paste pairing text."
          )
        );
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "Image decoding unavailable. Paste pairing text instead."
      );
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height);
    const qr = jsQR(pixels.data, image.width, image.height);
    if (!qr?.data)
      throw new Error(
        "No QR code found. Choose another image or paste pairing text."
      );
    return qr.data;
  }
  return (
    <div className="flex flex-col items-start gap-2 mt-2">
      <label className="text-xs text-gray-500">
        Scan QR from image:
        <input
          type="file"
          accept="image/*"
          disabled={disabled || pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void run(() => decodeFile(file));
          }}
        />
      </label>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          void run(async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (!text.trim())
                throw new Error(
                  "Clipboard is empty. Paste pairing text instead."
                );
              return text;
            } catch (failure) {
              throw new Error(
                failure instanceof Error &&
                  failure.message.startsWith("Clipboard is empty")
                  ? failure.message
                  : "Unable to read clipboard. Grant permission or paste pairing text."
              );
            }
          })
        }
      >
        Paste QR/Text from Clipboard
      </button>
      {pending && <p role="status">Reading pairing input…</p>}
      {error && (
        <>
          <p role="alert" style={{ overflowWrap: "anywhere" }}>
            {error}
          </p>
          <button
            type="button"
            disabled={disabled || pending}
            onClick={() => {
              if (retryAction.current) void run(retryAction.current);
            }}
          >
            Retry import
          </button>
        </>
      )}
    </div>
  );
};
