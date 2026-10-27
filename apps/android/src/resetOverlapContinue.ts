/** Synthetic acceptance-only control, kept inside the measured Android host rectangle. */
export function createResetOverlapContinue(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Continue reset overlap";
  Object.assign(button.style, {
    position: "fixed",
    left: "calc(var(--clipp-content-left, 0px) + 12px)",
    top: "calc(var(--clipp-content-top, 0px) + 12px)",
    zIndex: "1001",
  });
  return button;
}
