import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IconButton } from "../../packages/ui/src/controls";

describe("named local controls", () => {
  it("keeps Pin's stable name and pressed state on the button, with no separate SVG focus target", () => {
    const markup = renderToStaticMarkup(
      React.createElement(IconButton, {
        icon: "pin",
        label: "Pin Clip",
        "aria-pressed": true,
      })
    );
    expect(markup).toContain('aria-label="Pin Clip"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('focusable="false"');
    expect(markup).not.toContain("<title");
  });
});
