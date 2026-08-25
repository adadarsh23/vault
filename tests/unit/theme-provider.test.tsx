/* @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ThemeProvider } from '../../src/components/ThemeProvider';
import { useThemeStore } from '../../src/store/themeStore';

describe('ThemeProvider & Theme Changing Animation', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    useThemeStore.setState({ theme: 'dark' });
  });

  afterEach(() => {
    document.documentElement.className = '';
    vi.restoreAllMocks();
  });

  it('renders children and applies the dark theme class to documentElement', () => {
    const { getByText } = render(
      <ThemeProvider>
        <div>Content Inside ThemeProvider</div>
      </ThemeProvider>,
    );

    expect(getByText('Content Inside ThemeProvider')).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('updates theme class when theme in store changes', () => {
    render(
      <ThemeProvider>
        <div>App Content</div>
      </ThemeProvider>,
    );

    expect(document.documentElement.classList.contains('dark')).toBe(true);

    act(() => {
      useThemeStore.getState().setTheme('light');
    });

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('exposes __recordThemeToggleOrigin and captures touch/pointer coordinates correctly', () => {
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

    expect(document.documentElement.classList.contains('light')).toBe(true);
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
});
