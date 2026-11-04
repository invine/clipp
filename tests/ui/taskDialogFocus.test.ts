import { bindTaskDialogFocus } from "../../packages/ui/src/taskDialogFocus";

// Unit DOM/event port only. Native summary focus/default Tab order is separately
// exercised by the real ClipboardApp renderer harness and Android journey.
class ElementPort extends EventTarget {
  children: ElementPort[] = [];
  parentElement: ElementPort | null = null;
  disabled = false;
  hidden = false;
  inert = false;
  open = false;
  tabIndex: number;
  explicitTabIndex = false;
  task = false;
  returnControl = false;
  dataset: Record<string, string> = {};
  constructor(
    readonly tagName: string,
    readonly owner: { activeElement: ElementPort }
  ) {
    super();
    this.tabIndex = ["BUTTON", "SUMMARY"].includes(tagName) ? 0 : -1;
  }
  append(...children: ElementPort[]) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }
  get isConnected(): boolean {
    return true;
  }
  contains(element: ElementPort): boolean {
    return (
      element === this || this.children.some((child) => child.contains(element))
    );
  }
  focus() {
    this.owner.activeElement = this;
  }
  closest(selector: string): ElementPort | null {
    if (
      (selector.includes("[inert]") && this.inert) ||
      (selector.includes("[hidden]") && this.hidden)
    )
      return this;
    return this.parentElement?.closest(selector) ?? null;
  }
  matches(selector: string): boolean {
    return selector === ":disabled" && this.disabled;
  }
  getClientRects(): DOMRectList {
    if (this.hidden) return [] as unknown as DOMRectList;
    if (
      this.parentElement?.tagName === "DETAILS" &&
      !this.parentElement.open &&
      this !==
        this.parentElement.children.find((child) => child.tagName === "SUMMARY")
    )
      return [] as unknown as DOMRectList;
    return (
      this.parentElement?.getClientRects() ?? ([{}] as unknown as DOMRectList)
    );
  }
  querySelectorAll(selector: string): ElementPort[] {
    const all = this.children.flatMap((child) => [
      child,
      ...child.querySelectorAll("*"),
    ]);
    if (selector === "*") return all;
    return all.filter((element) =>
      selector.split(",").some((part) => {
        const rule = part.trim();
        if (rule === "[data-task-dialog]") return element.task;
        if (rule === "[data-session-focus]")
          return !!element.dataset.sessionFocus;
        if (rule === '[tabindex]:not([tabindex="-1"])')
          return element.explicitTabIndex && element.tabIndex !== -1;
        if (rule === "details > summary:first-of-type")
          return (
            element.tagName === "SUMMARY" &&
            element.parentElement?.tagName === "DETAILS" &&
            element.parentElement.children.find(
              (child) => child.tagName === "SUMMARY"
            ) === element
          );
        const tag = /^(button|input|textarea|select)/.exec(rule)?.[1];
        return (
          !!tag &&
          element.tagName === tag.toUpperCase() &&
          (!rule.includes(":disabled") || !element.disabled)
        );
      })
    );
  }
  querySelector(selector: string): ElementPort | null {
    if (selector === "[data-task-return]")
      return (
        this.querySelectorAll("*").find((element) => element.returnControl) ??
        null
      );
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

function fixture() {
  const owner = { activeElement: null as unknown as ElementPort };
  const make = (name: string) => new ElementPort(name, owner);
  const body = make("BODY"),
    dialog = make("DIV"),
    outside = make("BUTTON"),
    scenarioControls = make("ASIDE");
  const close = make("BUTTON"),
    details = make("DETAILS"),
    summary = make("SUMMARY"),
    hiddenChild = make("BUTTON"),
    laterSummary = make("SUMMARY"),
    pairing = make("BUTTON"),
    cancel = make("BUTTON");
  laterSummary.tabIndex = -1;
  close.returnControl = true;
  dialog.task = true;
  scenarioControls.dataset.taskScenarioControls = "";
  details.append(summary, hiddenChild, laterSummary);
  dialog.append(close, details, pairing, cancel);
  body.append(dialog, outside, scenarioControls);
  outside.focus();
  const doc = {
    body,
    get activeElement() {
      return owner.activeElement;
    },
    querySelectorAll: (selector: string) => body.querySelectorAll(selector),
    querySelector: (selector: string) => body.querySelector(selector),
  };
  let recover: () => void = () => {};
  class ObserverPort {
    constructor(callback: () => void) {
      recover = callback;
    }
    observe() {}
    disconnect() {}
  }
  const saved = Object.fromEntries(
    ["document", "HTMLElement", "MutationObserver"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: doc },
    HTMLElement: { configurable: true, value: ElementPort },
    MutationObserver: { configurable: true, value: ObserverPort },
  });
  const dispose = bindTaskDialogFocus(dialog as unknown as HTMLElement, {
    fallback: close as unknown as HTMLElement,
  });
  const tab = (shiftKey = false) => {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperties(event, {
      key: { value: "Tab" },
      shiftKey: { value: shiftKey },
    });
    dialog.dispatchEvent(event);
    return event;
  };
  return {
    owner,
    dialog,
    outside,
    scenarioControls,
    close,
    details,
    summary,
    hiddenChild,
    laterSummary,
    pairing,
    cancel,
    tab,
    recover: () => recover(),
    restore() {
      dispose();
      for (const [key, descriptor] of Object.entries(saved)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

it("keeps marked scripted scenario controls available while task focus is active", () => {
  const f = fixture();
  try {
    expect(f.outside.inert).toBe(true);
    expect(f.scenarioControls.inert).toBe(false);
  } finally {
    f.restore();
  }
});

it.each([false, true])(
  "does not intercept Tab from a focused Technical details summary (observer delivered=%s)",
  (observerDelivered) => {
    const f = fixture();
    try {
      f.summary.focus();
      if (observerDelivered) f.recover();
      const event = f.tab();
      expect(event.defaultPrevented).toBe(false);
      expect(f.owner.activeElement === f.summary).toBe(true);
    } finally {
      f.restore();
    }
  }
);

it("allows Shift-Tab from the summary and keeps both final-control wraps", () => {
  const f = fixture();
  try {
    f.summary.focus();
    expect(f.tab(true).defaultPrevented).toBe(false);
    expect(f.owner.activeElement === f.summary).toBe(true);
    f.cancel.focus();
    expect(f.tab().defaultPrevented).toBe(true);
    expect(f.owner.activeElement === f.close).toBe(true);
    expect(f.tab(true).defaultPrevented).toBe(true);
    expect(f.owner.activeElement === f.cancel).toBe(true);
  } finally {
    f.restore();
  }
});

it("uses only the first eligible direct summary while closed-details children, disabled and inert controls stay out", () => {
  const f = fixture();
  try {
    f.pairing.disabled = true;
    f.cancel.inert = true;
    f.summary.focus();
    expect(f.tab().defaultPrevented).toBe(true);
    expect(f.owner.activeElement === f.close).toBe(true);
    expect(f.tab(true).defaultPrevented).toBe(true);
    expect(f.owner.activeElement === f.summary).toBe(true);
    f.summary.tabIndex = -1;
    f.close.focus();
    expect(f.tab().defaultPrevented).toBe(true);
    expect(f.owner.activeElement === f.close).toBe(true);
  } finally {
    f.restore();
  }
});
