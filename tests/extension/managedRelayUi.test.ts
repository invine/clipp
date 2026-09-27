import { authorizedRelayUi } from "../../apps/extension/src/managedRelayUi";

describe("managed relay UI action boundary", () => {
  const id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const popup = `chrome-extension://${id}/src/popup.html`;
  const options = `chrome-extension://${id}/src/options.html`;

  it("permits only this extension's popup or options page", () => {
    expect(authorizedRelayUi({ id, url: popup }, id, popup, options)).toBe(
      true
    );
    expect(authorizedRelayUi({ id, url: options }, id, popup, options)).toBe(
      true
    );
    expect(
      authorizedRelayUi(
        { id, url: "https://site.example/" },
        id,
        popup,
        options
      )
    ).toBe(false);
    expect(
      authorizedRelayUi({ id: "other", url: popup }, id, popup, options)
    ).toBe(false);
    expect(
      authorizedRelayUi(
        { id, url: `chrome-extension://${id}/offscreen.html` },
        id,
        popup,
        options
      )
    ).toBe(false);
  });
});
