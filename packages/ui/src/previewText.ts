/// <reference lib="es2022.intl" />
const segmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** Preview text never rewrites the exact value used by actions or inspection. */
export function previewGraphemes(text: string): string[] {
  // Older embedded hosts retain full input rather than guessing unsafe boundaries.
  return segmenter
    ? Array.from(segmenter.segment(text), ({ segment }) => segment)
    : [text];
}

export function shortenPreview(
  text: string,
  maximum = 220,
  placement: "end" | "middle" = "end"
): string {
  const graphemes = previewGraphemes(text);
  if (graphemes.length <= maximum) return text;
  if (placement === "end") return graphemes.slice(0, maximum).join("") + "…";
  const available = Math.max(0, maximum - 1);
  const lead = Math.ceil(available / 2);
  const tail = Math.floor(available / 2);
  return (
    graphemes.slice(0, lead).join("") +
    "…" +
    (tail ? graphemes.slice(-tail).join("") : "")
  );
}

/** Fit a label using text metrics, without modifying or measuring DOM nodes. */
export function fitMiddlePreview(
  text: string,
  width: number,
  measure: (value: string) => number,
  maximum?: number
): string {
  // Match layout's subpixel rounding rather than shortening a label that fits.
  const availableWidth = width + 0.5;
  if (measure(text) <= availableWidth) return text;
  const graphemes = previewGraphemes(text);
  // Without segmentation, retain the input and let CSS clip it safely.
  if (graphemes.length === 1) return text;
  let low = 1;
  let high = Math.max(
    1,
    Math.min(maximum ?? graphemes.length, graphemes.length)
  );
  let best = "…";
  while (low <= high) {
    const count = Math.floor((low + high) / 2);
    const available = count - 1;
    const lead = Math.ceil(available / 2);
    const tail = Math.floor(available / 2);
    const candidate =
      graphemes.slice(0, lead).join("") +
      "…" +
      (tail ? graphemes.slice(-tail).join("") : "");
    if (measure(candidate) <= availableWidth) {
      best = candidate;
      low = count + 1;
    } else high = count - 1;
  }
  return best;
}
