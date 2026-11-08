import {
  fitMiddlePreview,
  previewGraphemes,
} from "../../packages/ui/src/previewText";

it("fits using measured glyph widths and preserves both ends", () => {
  const measure = (text: string) =>
    [...text].reduce((width, glyph) => width + (glyph === "W" ? 4 : 1), 0);
  const fitted = fitMiddlePreview(
    "WWWWabcdefghijklmnopqrstuvwxyz",
    10,
    measure
  );
  expect(measure(fitted)).toBeLessThanOrEqual(10);
  expect(fitted).toMatch(/^W.*….*z$/);
  expect(fitMiddlePreview("Short", 20, measure)).toBe("Short");
});

it("does not split emoji, combining marks or joined graphemes", () => {
  const cluster = "👩🏽‍💻e\u0301🇦🇪";
  const fitted = fitMiddlePreview(
    cluster.repeat(4),
    5,
    (value) => previewGraphemes(value).length
  );
  expect(previewGraphemes(fitted)).toEqual([
    "👩🏽‍💻",
    "e\u0301",
    "…",
    "e\u0301",
    "🇦🇪",
  ]);
});

it("caps a truncated label without shortening text that already fits", () => {
  const measure = (text: string) => previewGraphemes(text).length;
  expect(fitMiddlePreview("abcdefghijklmnopqrstuvwxyz", 20, measure, 7)).toBe(
    "abc…xyz"
  );
  expect(fitMiddlePreview("abc", 20, measure, 1)).toBe("abc");
});

it("keeps a source name whole across fractional canvas and layout rounding", () => {
  const measure = (text: string) =>
    text === "Extension" ? 54.4 : text.length * 6;
  expect(fitMiddlePreview("Extension", 54.3, measure)).toBe("Extension");
});
