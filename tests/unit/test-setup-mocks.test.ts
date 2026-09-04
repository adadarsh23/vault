/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  triggerResize,
  resetResizeObservers,
  triggerIntersection,
  triggerAllIntersections,
  resetIntersectionObservers,
  setMatchMediaMatches,
  resetMatchMedia,
  resetMockObjectURLs,
  resetMockClipboard,
} from '../setup/mocks/index.ts';

describe('Test Setup & Polyfill Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetResizeObservers();
    resetIntersectionObservers();
    resetMatchMedia();
    resetMockObjectURLs();
    resetMockClipboard();
  });

  describe('ResizeObserver Mock & Trigger', () => {
    it('accurately observes elements and invokes callback upon triggerResize', () => {
      const element = document.createElement('div');
      const callback = vi.fn();

      const observer = new ResizeObserver(callback);
      observer.observe(element);

      expect(callback).not.toHaveBeenCalled();

      triggerResize(element, { width: 500, height: 300 });

      expect(callback).toHaveBeenCalledTimes(1);
      const [entries, obs] = callback.mock.calls[0];
      expect(obs).toBe(observer);
      expect(entries).toHaveLength(1);
      expect(entries[0].target).toBe(element);
      expect(entries[0].contentRect.width).toBe(500);
      expect(entries[0].contentRect.height).toBe(300);
      expect(entries[0].borderBoxSize[0].inlineSize).toBe(500);
      expect(entries[0].borderBoxSize[0].blockSize).toBe(300);

      // Disconnect should stop triggering
      observer.disconnect();
      triggerResize(element, { width: 600, height: 400 });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('handles unobserve correctly', () => {
      const elementA = document.createElement('div');
      const elementB = document.createElement('div');
      const callback = vi.fn();

      const observer = new ResizeObserver(callback);
      observer.observe(elementA);
      observer.observe(elementB);

      observer.unobserve(elementA);
      triggerResize(elementA, { width: 200 });
      expect(callback).not.toHaveBeenCalled();

      triggerResize(elementB, { width: 400 });
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0][0].target).toBe(elementB);
    });
  });

  describe('IntersectionObserver Mock & Trigger', () => {
    it('does not trigger synchronously on observe and responds to triggerIntersection', () => {
      const target = document.createElement('section');
      const callback = vi.fn();

      const observer = new IntersectionObserver(callback, { threshold: 0.5 });
      observer.observe(target);

      // Should NOT fire immediately
      expect(callback).not.toHaveBeenCalled();

      // Trigger entering viewport
      triggerIntersection(target, { isIntersecting: true, intersectionRatio: 0.8 });

      expect(callback).toHaveBeenCalledTimes(1);
      const [entries, obs] = callback.mock.calls[0];
      expect(obs).toBe(observer);
      expect(entries).toHaveLength(1);
      expect(entries[0].target).toBe(target);
      expect(entries[0].isIntersecting).toBe(true);
      expect(entries[0].intersectionRatio).toBe(0.8);
      expect(entries[0].boundingClientRect).toBeDefined();

      // Trigger leaving viewport
      triggerIntersection(target, { isIntersecting: false, intersectionRatio: 0 });
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback.mock.calls[1][0][0].isIntersecting).toBe(false);
    });

    it('triggers all observed elements with triggerAllIntersections', () => {
      const el1 = document.createElement('div');
      const el2 = document.createElement('div');
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const obs1 = new IntersectionObserver(callback1);
      const obs2 = new IntersectionObserver(callback2);

      obs1.observe(el1);
      obs2.observe(el2);

      triggerAllIntersections(true);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback1.mock.calls[0][0][0].target).toBe(el1);
      expect(callback2.mock.calls[0][0][0].target).toBe(el2);
    });
  });

  describe('matchMedia Mock & Event Listeners', () => {
    it('notifies listeners when media query matches change', () => {
      const query = '(prefers-color-scheme: dark)';
      const mql = window.matchMedia(query);

      expect(mql.matches).toBe(false);
      expect(mql.media).toBe(query);

      const standardListener = vi.fn();
      const legacyListener = vi.fn();
      const onchangeHandler = vi.fn();

      mql.addEventListener('change', standardListener);
      mql.addListener(legacyListener);
      mql.onchange = onchangeHandler;

      setMatchMediaMatches(query, true);

      expect(mql.matches).toBe(true);
      expect(standardListener).toHaveBeenCalledWith(
        expect.objectContaining({ matches: true, media: query }),
      );
      expect(legacyListener).toHaveBeenCalledWith(mql);
      expect(onchangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({ matches: true, media: query }),
      );

      // Removal of listeners
      mql.removeEventListener('change', standardListener);
      mql.removeListener(legacyListener);

      setMatchMediaMatches(query, false);
      expect(standardListener).toHaveBeenCalledTimes(1);
      expect(legacyListener).toHaveBeenCalledTimes(1);
      expect(onchangeHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Canvas Polyfills & Rendering Contexts', () => {
    it('generates non-empty Blobs via toBlob with proper mime type', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
      });

      expect(blob).toBeTruthy();
      expect(blob?.type).toBe('image/jpeg');
      expect(blob?.size).toBeGreaterThan(0);
    });

    it('generates valid base64 data URLs via toDataURL', () => {
      const canvas = document.createElement('canvas');
      const dataUrl = canvas.toDataURL('image/png');

      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('provides a functional 2D context fallback with measureText and getImageData', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 100;

      const ctx = canvas.getContext('2d');
      expect(ctx).toBeTruthy();

      expect(ctx?.measureText('Vault Security').width).toBeGreaterThan(0);

      const imgData = ctx?.getImageData(0, 0, 50, 50);
      expect(imgData).toBeTruthy();
      expect(imgData?.data).toBeInstanceOf(Uint8ClampedArray);
      expect(imgData?.data.length).toBe(50 * 50 * 4);
    });

    it('provides a WebGL context fallback', () => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');

      expect(gl).toBeTruthy();
      expect(gl?.getParameter(0x1f00)).toContain('WebGL');
    });
  });

  describe('Storage, Clipboard & Object URL Isolation', () => {
    it('reads and writes to mock clipboard', async () => {
      await navigator.clipboard.writeText('secure_vault_passphrase');
      const text = await navigator.clipboard.readText();
      expect(text).toBe('secure_vault_passphrase');
    });

    it('allocates and revokes mock object URLs', () => {
      const dummyBlob = new Blob(['test'], { type: 'text/plain' });
      const url1 = URL.createObjectURL(dummyBlob);
      const url2 = URL.createObjectURL(dummyBlob);

      expect(url1).toMatch(/^blob:http:\/\/localhost:3000\/mock-blob-/);
      expect(url1).not.toBe(url2);

      URL.revokeObjectURL(url1);
    });
  });
});
