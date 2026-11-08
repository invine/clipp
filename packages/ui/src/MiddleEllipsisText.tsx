import React, { useEffect, useRef, useState } from "react";
import { fitMiddlePreview, previewGraphemes } from "./previewText";

let context: CanvasRenderingContext2D | null | undefined;

export function MiddleEllipsisText({
  text,
  max,
  className,
  style,
}: {
  text: string;
  max?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [fitted, setFitted] = useState({ text, display: text });
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let width = 0;
    const fit = () => {
      if (!width) return;
      context ??= document.createElement("canvas").getContext("2d");
      if (!context) return;
      const metrics = context;
      const computed = getComputedStyle(container);
      metrics.font =
        computed.font ||
        `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
      const spacing = Number.parseFloat(computed.letterSpacing) || 0;
      const display = fitMiddlePreview(
        text,
        width,
        (value) =>
          metrics.measureText(value).width +
          spacing * Math.max(0, previewGraphemes(value).length - 1),
        max
      );
      setFitted((previous) =>
        previous.text === text && previous.display === display
          ? previous
          : { text, display }
      );
    };
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            width = entries[0].contentRect.width;
            fit();
          })
        : null;
    const resize = () => {
      width = container.clientWidth;
      fit();
    };
    if (resizeObserver) resizeObserver.observe(container);
    else {
      resize();
      window.addEventListener("resize", resize);
    }
    document.fonts?.addEventListener("loadingdone", fit);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      document.fonts?.removeEventListener("loadingdone", fit);
    };
  }, [text, max]);

  return (
    <span
      ref={containerRef}
      className={`middle-ellipsis${className ? ` ${className}` : ""}`}
      style={style}
      title={text}
    >
      <span className="middle-ellipsis-text">
        {fitted.text === text ? fitted.display : text}
      </span>
    </span>
  );
}
