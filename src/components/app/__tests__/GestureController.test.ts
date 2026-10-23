/* @vitest-environment jsdom */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useGestureController } from '../GestureController';

describe('GestureController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375, // mobile screen width
    });
  });

  it('initializes in idle state without dragging', () => {
    const setIsSidebarOpen = vi.fn();
    const { result } = renderHook(() =>
      useGestureController({
        isSidebarOpen: false,
        setIsSidebarOpen,
        locationPath: '/',
        sidebarPosition: 'left',
      }),
    );

    expect(result.current.isSidebarDragging).toBe(false);
    expect(result.current.showMobileOverlay).toBe(false);
    expect(result.current.mobileSidebarTransform).toBeUndefined();
  });

  it('resets open sidebar state on route change', () => {
    const setIsSidebarOpen = vi.fn();
    const { rerender } = renderHook(
      ({ path }) =>
        useGestureController({
          isSidebarOpen: true,
          setIsSidebarOpen,
          locationPath: path,
          sidebarPosition: 'left',
        }),
      { initialProps: { path: '/dashboard' } },
    );

    rerender({ path: '/settings' });

    expect(setIsSidebarOpen).toHaveBeenCalledWith(false);
  });

  it('closes sidebar on desktop breakpoint resize', () => {
    const setIsSidebarOpen = vi.fn();
    renderHook(() =>
      useGestureController({
        isSidebarOpen: true,
        setIsSidebarOpen,
        locationPath: '/',
        sidebarPosition: 'left',
      }),
    );

    act(() => {
      window.innerWidth = 1200;
      window.dispatchEvent(new Event('resize'));
    });

    expect(setIsSidebarOpen).toHaveBeenCalledWith(false);
  });

  it('supports right-positioned sidebar direction mapping', () => {
    const setIsSidebarOpen = vi.fn();
    const { result } = renderHook(() =>
      useGestureController({
        isSidebarOpen: false,
        setIsSidebarOpen,
        locationPath: '/',
        sidebarPosition: 'right',
      }),
    );

    expect(result.current.isSidebarDragging).toBe(false);
  });
});
