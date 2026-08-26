type OffscreenClipboardControl = {
  value: string;
  tabIndex: number;
  style: Pick<CSSStyleDeclaration, "position" | "left" | "top" | "opacity" | "pointerEvents">;
  setAttribute(name: string, value: string): void;
  select(): void;
  remove(): void;
};

export type OffscreenClipboardDocument = {
  body: { appendChild(control: OffscreenClipboardControl): unknown };
  createElement(tagName: "textarea"): OffscreenClipboardControl;
  execCommand(command: "copy"): boolean;
};

export function createOffscreenClipboardWriter(
  document: OffscreenClipboardDocument = globalThis.document as unknown as OffscreenClipboardDocument,
): (text: string) => Promise<void> {
  return async (text: string): Promise<void> => {
    const control = document.createElement("textarea");
    try {
      control.value = text;
      control.tabIndex = -1;
      control.setAttribute("aria-hidden", "true");
      control.style.position = "fixed";
      control.style.left = "-10000px";
      control.style.top = "0";
      control.style.opacity = "0";
      control.style.pointerEvents = "none";
      document.body.appendChild(control);
      control.select();
      if (!document.execCommand("copy")) throw new Error("clipboard_write_failed");
    } catch {
      throw new Error("clipboard_write_failed");
    } finally {
      control.value = "";
      control.remove();
    }
  };
}
