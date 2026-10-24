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
