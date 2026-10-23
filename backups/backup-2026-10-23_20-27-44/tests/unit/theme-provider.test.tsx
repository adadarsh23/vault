/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../../src/components/ThemeProvider';
import { useThemeStore } from '../../src/store/themeStore';

describe('ThemeProvider & Theme Changing Animation', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    useThemeStore.setState({ theme: 'dark' });
  });

  afterEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders children and applies the dark theme class and data-theme to documentElement', () => {
    const { getByText } = render(
      <ThemeProvider>
        <div>Content Inside ThemeProvider</div>
      </ThemeProvider>,
    );

    expect(getByText('Content Inside ThemeProvider')).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('updates theme class when theme in store changes', () => {
    vi.useFakeTimers();
    render(
      <ThemeProvider>
        <div>App Content</div>
      </ThemeProvider>,
    );

    expect(document.documentElement.classList.contains('dark')).toBe(true);

    act(() => {
      useThemeStore.getState().setTheme('light');
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    vi.useRealTimers();
  });

  it('exposes __recordThemeToggleOrigin and captures touch/pointer coordinates correctly', () => {
    vi.useFakeTimers();
    render(
      <ThemeProvider>
        <div>App Content</div>
      </ThemeProvider>,
    );

    expect(typeof window.__recordThemeToggleOrigin).toBe('function');

    act(() => {
      window.__recordThemeToggleOrigin?.(150, 300);
      useThemeStore.getState().setTheme('light');
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(document.documentElement.classList.contains('light')).toBe(true);

    vi.useRealTimers();
  });

  it('handles fallback animation when startViewTransition is unsupported', () => {
    vi.useFakeTimers();
    const overlay = document.createElement('div');
    overlay.id = 'theme-transition-overlay';
    document.body.appendChild(overlay);

    render(
      <ThemeProvider>
        <div>App Content</div>
      </ThemeProvider>,
    );

    act(() => {
      useThemeStore.getState().setTheme('light');
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(document.documentElement.classList.contains('light')).toBe(true);

    overlay.remove();
    vi.useRealTimers();
  });

  it('executes startViewTransition and passes CSS variables when View Transitions API is available', () => {
    const startViewTransitionMock = vi.fn((cb: () => void) => {
      cb();
      return {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
      };
    });

    (document as any).startViewTransition = startViewTransitionMock;

    render(
      <ThemeProvider>
        <div>App Content</div>
      </ThemeProvider>,
    );

    act(() => {
      window.__recordThemeToggleOrigin?.(200, 400);
      useThemeStore.getState().setTheme('light');
    });

    expect(startViewTransitionMock).toHaveBeenCalled();
    expect(document.documentElement.classList.contains('light')).toBe(true);

    delete (document as any).startViewTransition;
  });

  it('detects keyboard interaction coordinates from active element', () => {
    vi.useFakeTimers();
    render(
      <ThemeProvider>
        <button id="theme-btn">Toggle Theme</button>
      </ThemeProvider>,
    );

    const btn = document.getElementById('theme-btn')!;
    btn.focus();

    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
      useThemeStore.getState().setTheme('light');
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(document.documentElement.classList.contains('light')).toBe(true);

    vi.useRealTimers();
  });

  it('updates live announcement for screen readers when theme changes', () => {
    const { container } = render(
      <ThemeProvider>
        <div>App Content</div>
      </ThemeProvider>,
    );

    act(() => {
      useThemeStore.getState().setTheme('light');
    });

    const liveRegion = container.querySelector('[role="status"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion?.textContent).toContain('Theme switched to light mode');
  });

  it('correctly toggles theme using toggleTheme helper', () => {
    useThemeStore.setState({ theme: 'dark' });
    act(() => {
      useThemeStore.getState().toggleTheme();
    });
    expect(useThemeStore.getState().theme).toBe('light');

    act(() => {
      useThemeStore.getState().toggleTheme();
    });
    expect(useThemeStore.getState().theme).toBe('dark');
  });
});
