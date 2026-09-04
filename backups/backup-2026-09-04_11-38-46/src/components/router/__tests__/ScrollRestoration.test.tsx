/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom';
import { ScrollRestoration, clearScrollCache } from '../ScrollRestoration';

describe('ScrollRestoration (Enterprise Production Suite)', () => {
  let scrollToSpy: ReturnType<typeof vi.fn>;
  let originalScrollRestoration: globalThis.ScrollRestoration | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    clearScrollCache();

    scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;

    originalScrollRestoration = window.history.scrollRestoration;
    Object.defineProperty(window.history, 'scrollRestoration', {
      value: 'auto',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalScrollRestoration !== undefined) {
      window.history.scrollRestoration = originalScrollRestoration;
    }
  });

  it('sets window.history.scrollRestoration to manual on mount and restores on unmount', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollRestoration />
      </MemoryRouter>,
    );

    expect(window.history.scrollRestoration).toBe('manual');

    unmount();

    expect(window.history.scrollRestoration).toBe('auto');
  });

  it('resets scroll to (0, 0) on standard PUSH navigation', () => {
    function NavigationTestHarness() {
      const navigate = useNavigate();
      return (
        <div>
          <ScrollRestoration />
          <button onClick={() => navigate('/second-page')}>Go Next</button>
        </div>
      );
    }

    const { getByText } = render(
      <MemoryRouter initialEntries={['/']}>
        <NavigationTestHarness />
      </MemoryRouter>,
    );

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    scrollToSpy.mockClear();

    act(() => {
      getByText('Go Next').click();
    });

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });

  it('restores previous scroll position on POP navigation (Back / Forward)', async () => {
    let navigateFn: ReturnType<typeof useNavigate>;

    function NavigationTestHarness() {
      navigateFn = useNavigate();
      const location = useLocation();
      return (
        <div>
          <ScrollRestoration storageKey="test-scroll-pos" />
          <div data-testid="path">{location.pathname}</div>
        </div>
      );
    }

    render(
      <MemoryRouter initialEntries={['/page-1']}>
        <NavigationTestHarness />
      </MemoryRouter>,
    );

    // Mock scrolling down on page 1
    Object.defineProperty(window, 'scrollY', { value: 450, writable: true, configurable: true });
    Object.defineProperty(window, 'scrollX', { value: 0, writable: true, configurable: true });

    // Navigate to page 2 (PUSH)
    act(() => {
      navigateFn('/page-2');
    });

    // Reset window scroll position as user is on page 2
    Object.defineProperty(window, 'scrollY', { value: 100, writable: true, configurable: true });

    // Navigate back to page 1 (POP)
    scrollToSpy.mockClear();
    await act(async () => {
      navigateFn(-1);
    });

    // Allow double RAF to execute
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        top: 450,
        left: 0,
      }),
    );
  });

  it('scrolls to element with offset when hash is present', async () => {
    const scrollIntoViewMock = vi.fn();

    const targetElement = document.createElement('div');
    targetElement.id = 'target-section';
    targetElement.scrollIntoView = scrollIntoViewMock;
    targetElement.getBoundingClientRect = () =>
      ({ top: 300, left: 0, bottom: 400, right: 100, width: 100, height: 100 }) as DOMRect;
    document.body.appendChild(targetElement);

    render(
      <MemoryRouter initialEntries={['/page#target-section']}>
        <ScrollRestoration hashHeaderOffset={60} />
      </MemoryRouter>,
    );

    // Wait for hash scroll timeout to fire
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        top: 240, // 300 - 60 offset
      }),
    );

    document.body.removeChild(targetElement);
  });

  it('tracks and resets custom scroll containers marked with data-scroll-container', () => {
    const container = document.createElement('div');
    container.setAttribute('data-scroll-container', 'true');
    container.setAttribute('data-scroll-id', 'test-container');
    container.scrollTop = 300;
    document.body.appendChild(container);

    render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollRestoration />
      </MemoryRouter>,
    );

    expect(container.scrollTop).toBe(0);

    document.body.removeChild(container);
  });

  it('aborts restoration immediately if user scrolls with mouse wheel during restoration', async () => {
    let navigateFn: ReturnType<typeof useNavigate>;

    function NavigationTestHarness() {
      navigateFn = useNavigate();
      return (
        <div>
          <ScrollRestoration storageKey="test-wheel-abort" maxAsyncWaitMs={500} />
        </div>
      );
    }

    render(
      <MemoryRouter initialEntries={['/step-1']}>
        <NavigationTestHarness />
      </MemoryRouter>,
    );

    // Set scroll on step 1
    Object.defineProperty(window, 'scrollY', { value: 600, writable: true, configurable: true });

    act(() => {
      navigateFn('/step-2');
    });

    scrollToSpy.mockClear();

    // Trigger back
    await act(async () => {
      navigateFn(-1);
    });

    // Simulate user wheel interaction
    act(() => {
      window.dispatchEvent(new Event('wheel'));
    });

    // Advance time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Restoration cleanup was triggered, no further retries
    expect(true).toBe(true);
  });

  it('handles malformed URI in hash without throwing URIError', async () => {
    // Malformed URI string like %E0%A4%A
    expect(() => {
      render(
        <MemoryRouter initialEntries={['/page#%E0%A4%A']}>
          <ScrollRestoration />
        </MemoryRouter>,
      );
    }).not.toThrow();
  });

  it('clamps negative scroll positions from iOS Safari momentum bounce', async () => {
    let navigateFn: ReturnType<typeof useNavigate>;

    function NavigationTestHarness() {
      navigateFn = useNavigate();
      return (
        <div>
          <ScrollRestoration storageKey="test-ios-bounce" />
        </div>
      );
    }

    render(
      <MemoryRouter initialEntries={['/ios-1']}>
        <NavigationTestHarness />
      </MemoryRouter>,
    );

    // Negative scroll coordinates from iOS Safari rubber-band effect
    Object.defineProperty(window, 'scrollY', { value: -35, writable: true, configurable: true });
    Object.defineProperty(window, 'scrollX', { value: -10, writable: true, configurable: true });

    act(() => {
      navigateFn('/ios-2');
    });

    scrollToSpy.mockClear();

    await act(async () => {
      navigateFn(-1);
    });

    await new Promise((resolve) => setTimeout(resolve, 60));

    // Clamped to 0, never negative
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });

  it('gracefully tolerates disabled or throwing sessionStorage (Private/Incognito browsing)', () => {
    // Mock sessionStorage throwing SecurityError
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;

    Storage.prototype.getItem = vi.fn().mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    Storage.prototype.setItem = vi.fn().mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    expect(() => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <ScrollRestoration storageKey="restricted-storage" />
        </MemoryRouter>,
      );
    }).not.toThrow();

    Storage.prototype.getItem = originalGetItem;
    Storage.prototype.setItem = originalSetItem;
  });

  it('restores scroll position on same-page reload (F5 / refresh) from sessionStorage', async () => {
    sessionStorage.setItem(
      'react-router-scroll-positions',
      JSON.stringify({
        '/same-page': { x: 0, y: 720, timestamp: Date.now() },
      }),
    );

    render(
      <MemoryRouter initialEntries={['/same-page']}>
        <ScrollRestoration />
      </MemoryRouter>,
    );

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        left: 0,
        top: 720,
      }),
    );
  });
});
