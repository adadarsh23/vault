import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore, getEffectiveTheme } from '../../src/store/themeStore';

describe('useThemeStore', () => {
  beforeEach(() => {
    useThemeStore.getState().resetTheme();
  });

  it('initializes with default system theme', () => {
    expect(useThemeStore.getState().theme).toBe('system');
  });

  it('updates theme to light or dark', () => {
    useThemeStore.getState().setTheme('dark');
    expect(useThemeStore.getState().theme).toBe('dark');

    useThemeStore.getState().setTheme('light');
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('toggles theme properly', () => {
    useThemeStore.getState().setTheme('light');
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');

    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('resolves effective theme correctly', () => {
    expect(getEffectiveTheme('dark')).toBe('dark');
    expect(getEffectiveTheme('light')).toBe('light');
    expect(['light', 'dark']).toContain(getEffectiveTheme('system'));
  });

  it('resets to default theme', () => {
    useThemeStore.getState().setTheme('dark');
    expect(useThemeStore.getState().theme).toBe('dark');

    useThemeStore.getState().resetTheme();
    expect(useThemeStore.getState().theme).toBe('system');
  });
});
