/**
 * Controllable ResizeObserver and IntersectionObserver mocks with behavioral trigger utilities.
 */

// ============================================================================
// ResizeObserver Mock & Simulation Utilities
// ============================================================================

export type ResizeObserverCallback = (
  entries: ResizeObserverEntry[],
  observer: ResizeObserver,
) => void;

const activeResizeObservers = new Set<MockResizeObserver>();

export class MockResizeObserver implements ResizeObserver {
  readonly callback: ResizeObserverCallback;
  readonly observedElements = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    activeResizeObservers.add(this);
  }

  observe(target: Element, _options?: ResizeObserverOptions): void {
    if (target) {
      this.observedElements.add(target);
    }
  }

  unobserve(target: Element): void {
    if (target) {
      this.observedElements.delete(target);
    }
  }

  disconnect(): void {
    this.observedElements.clear();
    activeResizeObservers.delete(this);
  }
}

/**
 * Simulates a resize event on a target element and triggers subscribed ResizeObserver callbacks.
 */
export const triggerResize = (
  target: Element,
  contentRectOverrides: Partial<DOMRectReadOnly> = {},
  entryOverrides: Partial<ResizeObserverEntry> = {},
): void => {
  const defaultWidth = 800;
  const defaultHeight = 600;

  const contentRect: DOMRectReadOnly = {
    x: contentRectOverrides.x ?? 0,
    y: contentRectOverrides.y ?? 0,
    width: contentRectOverrides.width ?? defaultWidth,
    height: contentRectOverrides.height ?? defaultHeight,
    top: contentRectOverrides.top ?? contentRectOverrides.y ?? 0,
    left: contentRectOverrides.left ?? contentRectOverrides.x ?? 0,
    right:
      contentRectOverrides.right ??
      (contentRectOverrides.x ?? 0) + (contentRectOverrides.width ?? defaultWidth),
    bottom:
      contentRectOverrides.bottom ??
      (contentRectOverrides.y ?? 0) + (contentRectOverrides.height ?? defaultHeight),
    toJSON: () => ({ ...contentRect }),
  };

  const blockSize = contentRect.height;
  const inlineSize = contentRect.width;

  const entry: ResizeObserverEntry = {
    target,
    contentRect,
    borderBoxSize: [{ blockSize, inlineSize }],
    contentBoxSize: [{ blockSize, inlineSize }],
    devicePixelContentBoxSize: [{ blockSize, inlineSize }],
    ...entryOverrides,
  };

  for (const observer of activeResizeObservers) {
    if (observer.observedElements.has(target)) {
      try {
        observer.callback([entry], observer as unknown as ResizeObserver);
      } catch (err) {
        console.error('Error in ResizeObserver callback:', err);
      }
    }
  }
};

/**
 * Resets all active ResizeObserver instances.
 */
export const resetResizeObservers = (): void => {
  activeResizeObservers.clear();
};

// ============================================================================
// IntersectionObserver Mock & Simulation Utilities
// ============================================================================

export type IntersectionObserverCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver,
) => void;

const activeIntersectionObservers = new Set<MockIntersectionObserver>();

export class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '0px 0px 0px 0px';
  readonly scrollMargin: string = '0px 0px 0px 0px';
  readonly thresholds: ReadonlyArray<number> = [0];
  readonly callback: IntersectionObserverCallback;
  readonly observedElements = new Set<Element>();
  private pendingRecords: IntersectionObserverEntry[] = [];

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.root = options?.root ?? null;
    this.rootMargin = options?.rootMargin ?? '0px 0px 0px 0px';
    this.scrollMargin = (options as any)?.scrollMargin ?? '0px 0px 0px 0px';
    if (options?.threshold !== undefined) {
      this.thresholds = Array.isArray(options.threshold) ? options.threshold : [options.threshold];
    }
    activeIntersectionObservers.add(this);
  }

  observe(target: Element): void {
    if (target) {
      this.observedElements.add(target);
    }
  }

  unobserve(target: Element): void {
    if (target) {
      this.observedElements.delete(target);
    }
  }

  disconnect(): void {
    this.observedElements.clear();
    this.pendingRecords = [];
    activeIntersectionObservers.delete(this);
  }

  takeRecords(): IntersectionObserverEntry[] {
    const records = [...this.pendingRecords];
    this.pendingRecords = [];
    return records;
  }

  _queueRecord(record: IntersectionObserverEntry): void {
    this.pendingRecords.push(record);
  }
}

export interface TriggerIntersectionOptions {
  isIntersecting?: boolean;
  intersectionRatio?: number;
  boundingClientRect?: Partial<DOMRectReadOnly>;
  intersectionRect?: Partial<DOMRectReadOnly>;
  rootBounds?: Partial<DOMRectReadOnly> | null;
  time?: number;
}

const createMockDOMRect = (overrides: Partial<DOMRectReadOnly> = {}): DOMRectReadOnly => {
  const rect: DOMRectReadOnly = {
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 100,
    height: overrides.height ?? 100,
    top: overrides.top ?? overrides.y ?? 0,
    left: overrides.left ?? overrides.x ?? 0,
    right: overrides.right ?? (overrides.x ?? 0) + (overrides.width ?? 100),
    bottom: overrides.bottom ?? (overrides.y ?? 0) + (overrides.height ?? 100),
    toJSON: () => ({ ...rect }),
  };
  return rect;
};

/**
 * Simulates an element entering or exiting the viewport (or intersection root).
 */
export const triggerIntersection = (
  target: Element,
  options: TriggerIntersectionOptions = {},
): void => {
  const isIntersecting = options.isIntersecting ?? true;
  const intersectionRatio = options.intersectionRatio ?? (isIntersecting ? 1.0 : 0.0);

  const boundingClientRect = createMockDOMRect(options.boundingClientRect);
  const intersectionRect = isIntersecting
    ? createMockDOMRect(options.intersectionRect ?? options.boundingClientRect)
    : createMockDOMRect({ width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0, x: 0, y: 0 });

  const rootBounds =
    options.rootBounds === null
      ? null
      : createMockDOMRect(options.rootBounds ?? { width: 1024, height: 768 });

  const entry: IntersectionObserverEntry = {
    target,
    isIntersecting,
    intersectionRatio,
    boundingClientRect,
    intersectionRect,
    rootBounds,
    time: options.time ?? (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  };

  for (const observer of activeIntersectionObservers) {
    if (observer.observedElements.has(target)) {
      try {
        observer.callback([entry], observer as unknown as IntersectionObserver);
      } catch (err) {
        console.error('Error in IntersectionObserver callback:', err);
      }
    }
  }
};

/**
 * Triggers intersection for all currently observed elements across all observers.
 */
export const triggerAllIntersections = (isIntersecting = true): void => {
  for (const observer of activeIntersectionObservers) {
    for (const target of observer.observedElements) {
      triggerIntersection(target, { isIntersecting });
    }
  }
};

/**
 * Resets all active IntersectionObserver instances.
 */
export const resetIntersectionObservers = (): void => {
  activeIntersectionObservers.clear();
};

/**
 * Installs both ResizeObserver and IntersectionObserver global mocks.
 */
export const installObserverMocks = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: MockResizeObserver,
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: MockResizeObserver,
  });

  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver,
  });
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver,
  });
};
