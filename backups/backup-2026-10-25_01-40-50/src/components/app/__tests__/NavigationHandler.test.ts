/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getTabFromPathname,
  getPathnameForTab,
  isTabId,
  useNavigationHandler,
} from '../NavigationHandler';
import { renderHook, act } from '@testing-library/react';

const mockNavigate = vi.fn();
let mockLocation = { pathname: '/', hash: '', search: '' };

vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}));

vi.mock('../../store/globalNavigationStore', () => ({
  useGlobalNavigationStore: (selector: (state: any) => any) =>
    selector({ setTargetItemId: vi.fn() }),
}));

describe('NavigationHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation = { pathname: '/', hash: '', search: '' };
  });

  describe('Utility Functions', () => {
    it('resolves tab from pathname accurately', () => {
      expect(getTabFromPathname('/')).toBe('dashboard');
      expect(getTabFromPathname('/passwords')).toBe('passwords');
      expect(getTabFromPathname('/notes')).toBe('notes');
      expect(getTabFromPathname('/eco')).toBe('ecosystem');
      expect(getTabFromPathname('/unknown-path')).toBeNull();
    });

    it('resolves pathname for given tab', () => {
      expect(getPathnameForTab('dashboard')).toBe('/');
      expect(getPathnameForTab('secrets')).toBe('/secrets');
      expect(getPathnameForTab('photos')).toBe('/photos');
    });

    it('verifies valid tab identifiers', () => {
      expect(isTabId('dashboard')).toBe(true);
      expect(isTabId('passwords')).toBe(true);
      expect(isTabId('nonexistent')).toBe(false);
    });
  });

  describe('useNavigationHandler hook', () => {
    it('initializes with active tab based on location', () => {
      mockLocation = { pathname: '/notes', hash: '', search: '' };
      const { result } = renderHook(() => useNavigationHandler());
      expect(result.current.activeTab).toBe('notes');
    });

    it('navigates with tab identifier string', () => {
      const { result } = renderHook(() => useNavigationHandler());

      act(() => {
        result.current.navigateToTab('passwords');
      });

      expect(mockNavigate).toHaveBeenCalledWith(
        { pathname: '/passwords', hash: '', search: '' },
        { replace: false },
      );
    });

    it('navigates with route pathname (dual format support)', () => {
      const { result } = renderHook(() => useNavigationHandler());

      act(() => {
        result.current.navigateToTab('/cards');
      });

      expect(mockNavigate).toHaveBeenCalledWith(
        { pathname: '/cards', hash: '', search: '' },
        { replace: false },
      );
    });

    it('preserves hash anchors and query search parameters', () => {
      const { result } = renderHook(() => useNavigationHandler());

      act(() => {
        result.current.navigateToTab('notes?search=tax#section-2');
      });

      expect(mockNavigate).toHaveBeenCalledWith(
        { pathname: '/notes', hash: '#section-2', search: '?search=tax' },
        { replace: false },
      );
    });

    it('prevents redundant navigation to same destination', () => {
      mockLocation = { pathname: '/todos', hash: '', search: '' };
      const { result } = renderHook(() => useNavigationHandler());

      act(() => {
        result.current.navigateToTab('todos');
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
