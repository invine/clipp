// External browser/media/canvas boundary for the real public scanner. No decoder
// or application owner is replaced; supplied pixels are decoded by actual jsQR.
export function scannerBrowserBoundary() {
  const elements: Element[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  let activeElementIndex = -1;
  let visibilityState = "visible";
  let acquire!: (stream: MediaStream) => void;
  let reject!: (error: unknown) => void;
  let play: () => Promise<void> = async () => {};
  let pixels = {
    data: new Uint8ClampedArray(64 * 64 * 4).fill(255),
    width: 64,
    height: 64,
  };
  let imageError: unknown;
  let frameReads = 0;
  let acquireError: unknown;
  let contextAvailable = true;
  let providerCalls = 0;
  class Element extends EventTarget {
    style = {};
    inert = false;
    tabIndex = 0;
    dataset: Record<string, string> = {};
    get parentElement() {
      return this.parent;
    }
    get isConnected(): boolean {
      return this === body || !!this.parent?.isConnected;
    }
    getClientRects() {
      return this.isConnected ? [{}] : [];
    }
    closest() {
      return null;
    }
    matches(selector: string) {
      return selector === ":disabled" && this.disabled;
    }
    focus() {
      activeElementIndex = elements.indexOf(this);
    }
    click() {
      if (!this.disabled) this.dispatchEvent(new Event("click"));
    }
    contains(element: Element): boolean {
      return (
        this === element ||
        this.children.some((child) => child.contains(element))
      );
    }
    querySelector(selector: string) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
    querySelectorAll(selector: string): Element[] {
      return this.children.flatMap((child) => [
        ...(selector === "[data-task-dialog]"
          ? child.id === "clipp-android-qr-scanner"
            ? [child]
            : []
          : selector === "[data-session-focus]"
            ? []
            : child.tag === "button" && !child.disabled
              ? [child]
              : []),
        ...child.querySelectorAll(selector),
      ]);
    }
    className = "";
    id = "";
    textContent = "";
    disabled = false;
    parent: Element | null = null;
    children: Element[] = [];
    srcObject: unknown = null;
    readyState = 2;
    videoWidth = 64;
    videoHeight = 64;
    width = 64;
    height = 64;
    constructor(readonly tag: string) {
      super();
      elements.push(this);
    }
    append(...children: Element[]) {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter(
          (child) => child !== this
        );
      this.parent = null;
    }
    setAttribute() {}
    getBoundingClientRect() {
      return { width: 320, height: 480 };
    }
    play() {
      return play();
    }
    pause() {}
    getContext() {
      if (!contextAvailable) return null;
      return {
        drawImage() {},
        getImageData() {
          frameReads++;
          if (imageError) throw imageError;
          return pixels;
        },
      };
    }
  }
  const body = new Element("body");
  const document = Object.assign(new EventTarget(), {
    body,
    contains: (element: Element) => body.contains(element),
    querySelectorAll: (selector: string) => body.querySelectorAll(selector),
    querySelector: () => null,
    createElement: (tag: string) => new Element(tag),
    getElementById: (id: string) =>
      elements.find((e) => e.id === id && e.parent) ?? null,
    get visibilityState() {
      return visibilityState;
    },
  });
  Object.defineProperty(document, "activeElement", {
    get: () => elements[activeElementIndex] ?? null,
  });
  Object.defineProperty(document, "visibilityState", {
    get: () => visibilityState,
  });
  const window = new EventTarget();
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals: Record<string, unknown> = {
    document,
    window,
    navigator: {
      mediaDevices: {
        getUserMedia: () => {
          if (acquireError) throw acquireError;
          return new Promise<MediaStream>((resolve, fail) => {
            acquire = resolve;
            reject = fail;
          });
        },
      },
    },
    HTMLElement: Element,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    BarcodeDetector: class {
      constructor() {
        providerCalls++;
        throw Error("unsafe_provider_entered");
      }
    },
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  for (const [key, value] of Object.entries(globals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  return {
    flush,
    acquire() {
      let stopped = 0;
      const stream = {
        getTracks: () => [
          {
            stop() {
              stopped++;
            },
          },
        ],
      };
      acquire(stream as unknown as MediaStream);
      return () => stopped;
    },
    reject: (error: unknown) => reject(error),
    button: (text: string) =>
      elements.find((e) => {
        if (e.textContent !== text) return false;
        let parent = e.parent;
        while (parent && parent !== body) parent = parent.parent;
        return parent === body;
      })!,
    frameNow: () => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(1000);
    },
    frameReads: () => frameReads,
    frame: async () => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(1000);
      await flush();
    },
    background() {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    },
    resume() {
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    },
    pagehide() {
      window.dispatchEvent(new Event("pagehide"));
    },
    setPlay: (value: () => Promise<void>) => {
      play = value;
    },
    setPixels: (value: typeof pixels) => {
      pixels = value;
      for (const e of elements)
        if (e.tag === "video") {
          e.videoWidth = value.width;
          e.videoHeight = value.height;
        }
    },
    setImageError: (value: unknown) => {
      imageError = value;
    },
    withoutCanvas() {
      contextAvailable = false;
    },
    setAcquireError: (error: unknown) => {
      acquireError = error;
    },
    overlayCount: () => body.children.length,
    frameCount: () => frames.size,
    providerCalls: () => providerCalls,
    restore() {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}
