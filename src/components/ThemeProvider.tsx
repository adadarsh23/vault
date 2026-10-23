import React, { useLayoutEffect, useEffect, useCallback, useRef } from 'react';
import { useThemeStore } from '../store/themeStore';

declare global {
  interface Window {
    __recordThemeToggleOrigin?: (x: number, y: number) => void;
  }
}

// Universal isomorphic layout effect (avoids SSR hydration warnings)
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface InteractionCoord {
  x: number;
  y: number;
  timestamp: number;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useThemeStore((state) => state.theme);
  const isFirstRender = useRef(true);
  const currentResolvedIsDark = useRef<boolean | null>(null);
  const lastInteraction = useRef<InteractionCoord | null>(null);
  const transitionInFlight = useRef(false);

  // Managed timer and frame refs to prevent memory leaks and race conditions
  const fallbackRafRef = useRef<number | null>(null);
  const fallbackMidwayTimerRef = useRef<number | null>(null);
  const fallbackResetTimerRef = useRef<number | null>(null);
  const waveTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);

  // Ref-based accessibility announcement to prevent re-rendering the whole application tree
  const liveRegionRef = useRef<HTMLSpanElement | null>(null);

  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

  const announce = useCallback((message: string) => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = message;
    }
  }, []);

  // Multi-input coordinate tracking (pointer, touch, mouse, stylus, and keyboard focus)
  useIsomorphicLayoutEffect(() => {
    if (!isBrowser) return undefined;

    const recordCoords = (clientX: number, clientY: number) => {
      try {
        if (
          typeof clientX === 'number' &&
          typeof clientY === 'number' &&
          !Number.isNaN(clientX) &&
          !Number.isNaN(clientY) &&
          (clientX > 0 || clientY > 0)
        ) {
          lastInteraction.current = {
            x: Math.round(clientX),
            y: Math.round(clientY),
            timestamp: Date.now(),
          };
        }
      } catch {
        // Ignore coordinate calculation errors
      }
    };

    const supportsPointer = 'PointerEvent' in window;

    const handlePointerDown = (e: PointerEvent) => {
      recordCoords(e.clientX, e.clientY);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        recordCoords(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      recordCoords(e.clientX, e.clientY);
    };

    const handleClick = (e: MouseEvent) => {
      try {
        if (e.clientX > 0 || e.clientY > 0) {
          recordCoords(e.clientX, e.clientY);
        } else if (e.target && e.target instanceof HTMLElement) {
          const rect = e.target.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            recordCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
          }
        }
      } catch {
        // Ignore element inspection errors
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      try {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          const active = document.activeElement;
          if (active && active instanceof HTMLElement && active !== document.body) {
            const rect = active.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              recordCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
            }
          }
        }
      } catch {
        // Ignore active element inspection errors
      }
    };

    // Expose explicit origin recorder for components like Sidebar
    window.__recordThemeToggleOrigin = (x: number, y: number) => {
      recordCoords(x, y);
    };

    if (supportsPointer) {
      window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    } else {
      window.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
      window.addEventListener('mousedown', handleMouseDown, { capture: true, passive: true });
    }
    window.addEventListener('click', handleClick, { capture: true, passive: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: true });

    return () => {
      if (supportsPointer) {
        window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      } else {
        window.removeEventListener('touchstart', handleTouchStart, { capture: true });
        window.removeEventListener('mousedown', handleMouseDown, { capture: true });
      }
      window.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      delete window.__recordThemeToggleOrigin;
    };
  }, [isBrowser]);

  // Resolve theme with cross-browser error handling
  const getIsDark = useCallback(() => {
    if (!isBrowser) return false;

    try {
      if (theme === 'dark') return true;
      if (theme === 'light') return false;

      if (typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } catch (err) {
      console.warn('[ThemeProvider] matchMedia lookup failed, defaulting to dark mode:', err);
    }

    return false;
  }, [theme, isBrowser]);

  // Apply theme attributes (ultra-fast + minimal DOM updates)
  const updateAttributes = useCallback(
    (isDark: boolean) => {
      if (!isBrowser) return;

      try {
        const root = document.documentElement;
        if (!root) return;

        const newTheme = isDark ? 'dark' : 'light';
        const oldTheme = isDark ? 'light' : 'dark';

        root.classList.remove(oldTheme);
        root.classList.add(newTheme);
        root.setAttribute('data-theme', newTheme);
        root.style.colorScheme = newTheme;
        currentResolvedIsDark.current = isDark;

        // Synchronize SVG favicons and mask-icon without touching high-res PNG / apple-touch-icon
        const iconPath = isDark ? '/favicon-dark.svg' : '/favicon.svg';
        const svgIcons = document.querySelectorAll<HTMLLinkElement>(
          "link[type='image/svg+xml'], link[rel='mask-icon']",
        );
        svgIcons.forEach((link) => {
          if (link.rel === 'mask-icon') {
            link.setAttribute('color', isDark ? '#ffffff' : '#000000');
          } else {
            link.href = iconPath;
          }
        });

        // Synchronize theme-color meta tag for mobile address bars (iOS Safari, Android Chrome)
        const themeColor = isDark ? '#0a0a0a' : '#ffffff';
        const metaTags = document.querySelectorAll<HTMLMetaElement>("meta[name='theme-color']");
        if (metaTags.length > 0) {
          metaTags.forEach((meta) => {
            meta.content = themeColor;
          });
        } else if (document.head) {
          const meta = document.createElement('meta');
          meta.name = 'theme-color';
          meta.content = themeColor;
          document.head.appendChild(meta);
        }
      } catch (err) {
        console.error('[ThemeProvider] Error updating theme attributes:', err);
      }
    },
    [isBrowser],
  );

  // Calculate coordinates and max radius to cover all 4 screen corners on any device / DPR / viewport
  const getOriginAndRadius = useCallback(() => {
    let vw = 360;
    let vh = 640;

    try {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      vw = Math.max(
        vv?.width || 0,
        document.documentElement?.clientWidth || 0,
        window.innerWidth || 0,
        360,
      );
      vh = Math.max(
        vv?.height || 0,
        document.documentElement?.clientHeight || 0,
        window.innerHeight || 0,
        640,
      );
    } catch {
      vw = typeof window !== 'undefined' ? window.innerWidth || 360 : 360;
      vh = typeof window !== 'undefined' ? window.innerHeight || 640 : 640;
    }

    let x: number | undefined;
    let y: number | undefined;

    const last = lastInteraction.current;
    const now = Date.now();
    // Only use coordinates recorded within the last 3000ms to prevent stale jumps
    if (last && now - last.timestamp < 3000) {
      x = last.x;
      y = last.y;
    }

    // If no recent interaction coordinate, inspect keyboard activeElement
    if (typeof x !== 'number' || typeof y !== 'number' || (x <= 0 && y <= 0)) {
      try {
        const active = document.activeElement;
        if (
          active &&
          active !== document.body &&
          active !== document.documentElement &&
          active instanceof HTMLElement
        ) {
          const rect = active.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            x = Math.round(rect.left + rect.width / 2);
            y = Math.round(rect.top + rect.height / 2);
          }
        }
      } catch {
        // Fallback to center
      }
    }

    if (typeof x !== 'number' || Number.isNaN(x) || x < 0) x = Math.round(vw / 2);
    if (typeof y !== 'number' || Number.isNaN(y) || y < 0) y = Math.round(vh / 2);

    // Clamp coordinates within visible bounds
    x = Math.max(0, Math.min(vw, x));
    y = Math.max(0, Math.min(vh, y));

    // Calculate maximum distance to 4 corners with 5% margin + 16px for full coverage on high-DPI displays
    const maxDistX = Math.max(x, vw - x);
    const maxDistY = Math.max(y, vh - y);
    const endRadius = Math.ceil(Math.hypot(maxDistX, maxDistY) * 1.05) + 16;

    // Reset interaction coordinate after consuming
    lastInteraction.current = null;

    return { x, y, endRadius };
  }, []);

  // Trigger subtle ambient ripple wave on theme shift (GPU-optimized & leak-safe)
  const triggerThemeWave = useCallback((x: number, y: number, isDark: boolean) => {
    if (typeof document === 'undefined' || !document.body) return;

    try {
      const existing = document.getElementById('theme-wave-pulse');
      if (existing && existing.parentNode) {
        existing.remove();
      }

      const pulse = document.createElement('div');
      pulse.id = 'theme-wave-pulse';
      pulse.style.setProperty('--origin-x', `${x}px`);
      pulse.style.setProperty('--origin-y', `${y}px`);
      pulse.className = isDark ? 'is-dark' : 'is-light';
      document.body.appendChild(pulse);

      if (waveTimerRef.current !== null) {
        window.clearTimeout(waveTimerRef.current);
      }

      waveTimerRef.current = window.setTimeout(() => {
        if (pulse.parentNode) {
          pulse.remove();
        }
        waveTimerRef.current = null;
      }, 550);
    } catch {
      // Wave pulse is purely decorative, fail silently
    }
  }, []);

  // Fallback animation for browsers without View Transitions API (Firefox, older Safari, WebViews)
  const runFallbackAnimation = useCallback(
    (isDark: boolean) => {
      if (!isBrowser || !document.body) {
        updateAttributes(isDark);
        return;
      }

      // Clear any prior pending fallback animation frames and timers
      if (fallbackRafRef.current !== null) {
        window.cancelAnimationFrame(fallbackRafRef.current);
        fallbackRafRef.current = null;
      }
      if (fallbackMidwayTimerRef.current !== null) {
        window.clearTimeout(fallbackMidwayTimerRef.current);
        fallbackMidwayTimerRef.current = null;
      }
      if (fallbackResetTimerRef.current !== null) {
        window.clearTimeout(fallbackResetTimerRef.current);
        fallbackResetTimerRef.current = null;
      }

      try {
        let overlay = document.getElementById('theme-transition-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'theme-transition-overlay';
          document.body.appendChild(overlay);
        }

        const { x, y, endRadius } = getOriginAndRadius();
        const targetBgColor = isDark ? '#0a0a0a' : '#ffffff';

        triggerThemeWave(x, y, isDark);

        overlay.style.backgroundColor = targetBgColor;
        overlay.style.clipPath = `circle(0px at ${x}px ${y}px)`;
        overlay.style.setProperty('-webkit-clip-path', `circle(0px at ${x}px ${y}px)`);
        overlay.classList.add('is-active');

        fallbackRafRef.current = requestAnimationFrame(() => {
          fallbackRafRef.current = null;
          if (!overlay) return;
          overlay.style.clipPath = `circle(${endRadius}px at ${x}px ${y}px)`;
          overlay.style.setProperty('-webkit-clip-path', `circle(${endRadius}px at ${x}px ${y}px)`);

          // Midway through transition, swap theme attributes seamlessly
          fallbackMidwayTimerRef.current = window.setTimeout(() => {
            updateAttributes(isDark);
            fallbackMidwayTimerRef.current = null;
          }, 220);

          // After completion, cleanly reset overlay
          fallbackResetTimerRef.current = window.setTimeout(() => {
            if (overlay) {
              overlay.classList.remove('is-active');
              overlay.style.clipPath = '';
              overlay.style.removeProperty('-webkit-clip-path');
            }
            fallbackResetTimerRef.current = null;
          }, 480);
        });
      } catch (err) {
        console.warn('[ThemeProvider] Fallback animation failed, updating directly:', err);
        updateAttributes(isDark);
      }
    },
    [isBrowser, getOriginAndRadius, triggerThemeWave, updateAttributes],
  );

  // Animate theme change with universal cross-browser View Transitions support
  const animateThemeChange = useCallback(
    (isDark: boolean) => {
      if (!isBrowser) return;

      let prefersReducedMotion = false;
      try {
        if (typeof window.matchMedia === 'function') {
          prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        }
      } catch {
        prefersReducedMotion = false;
      }

      if (prefersReducedMotion) {
        updateAttributes(isDark);
        return;
      }

      const doc = document as any;

      // Check for native View Transitions API
      if (!('startViewTransition' in doc) || typeof doc.startViewTransition !== 'function') {
        runFallbackAnimation(isDark);
        return;
      }

      if (transitionInFlight.current) {
        updateAttributes(isDark);
        return;
      }

      const root = document.documentElement;
      if (!root) {
        updateAttributes(isDark);
        return;
      }

      try {
        transitionInFlight.current = true;
        const { x, y, endRadius } = getOriginAndRadius();
        triggerThemeWave(x, y, isDark);

        // Pass CSS variables so CSS keyframes work automatically across Safari 18+, iOS 18+, and Chromium
        root.style.setProperty('--theme-origin-x', `${x}px`);
        root.style.setProperty('--theme-origin-y', `${y}px`);
        root.style.setProperty('--theme-end-radius', `${endRadius}px`);

        // Suppress conflicting sub-transitions on document while capturing snapshot
        root.classList.add('theme-switching');

        let isCleanedUp = false;
        const cleanup = () => {
          if (isCleanedUp) return;
          isCleanedUp = true;
          transitionInFlight.current = false;
          if (safetyTimerRef.current !== null) {
            window.clearTimeout(safetyTimerRef.current);
            safetyTimerRef.current = null;
          }
          root.classList.remove('theme-switching');
          root.style.removeProperty('--theme-origin-x');
          root.style.removeProperty('--theme-origin-y');
          root.style.removeProperty('--theme-end-radius');
        };

        // Guarantee cleanup after 1200ms in case transition or animation stalls
        safetyTimerRef.current = window.setTimeout(cleanup, 1200);

        const transition = doc.startViewTransition(() => {
          try {
            updateAttributes(isDark);
          } catch (err) {
            console.error('[ThemeProvider] Error updating attributes during View Transition:', err);
          }
        });

        if (transition && typeof transition.ready?.then === 'function') {
          transition.ready
            .then(() => {
              // Attempt WAAPI animation for browsers supporting pseudoElement (Chromium);
              // Safari 18+ uses CSS @keyframes in index.css automatically.
              try {
                if (typeof root.animate === 'function') {
                  const animation = root.animate(
                    {
                      clipPath: [
                        `circle(0px at ${x}px ${y}px)`,
                        `circle(${endRadius}px at ${x}px ${y}px)`,
                      ],
                    },
                    {
                      duration: 480,
                      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                      pseudoElement: '::view-transition-new(root)',
                      fill: 'forwards',
                    },
                  );

                  if (animation && typeof animation.finished?.then === 'function') {
                    animation.finished.then(cleanup).catch(cleanup);
                  }
                }
              } catch {
                // If WAAPI pseudoElement is not supported (Safari/iOS), CSS keyframes take over
              }
            })
            .catch(() => {
              cleanup();
            });

          if (transition.finished && typeof transition.finished?.then === 'function') {
            transition.finished.then(cleanup).catch(cleanup);
          }
        } else {
          cleanup();
        }
      } catch (err) {
        console.warn('[ThemeProvider] View Transition failed, running fallback:', err);
        transitionInFlight.current = false;
        if (root) {
          root.classList.remove('theme-switching');
          root.style.removeProperty('--theme-origin-x');
          root.style.removeProperty('--theme-origin-y');
          root.style.removeProperty('--theme-end-radius');
        }
        updateAttributes(isDark);
      }
    },
    [isBrowser, getOriginAndRadius, runFallbackAnimation, triggerThemeWave, updateAttributes],
  );

  // Handle theme changes
  useIsomorphicLayoutEffect(() => {
    if (!isBrowser) return;

    const isDark = getIsDark();

    if (isFirstRender.current) {
      updateAttributes(isDark);
      isFirstRender.current = false;
      return;
    }

    // Set screen reader auditory announcement directly on the live region
    announce(
      theme === 'system'
        ? `Theme updated to match system settings (${isDark ? 'Dark' : 'Light'})`
        : `Theme switched to ${theme} mode`,
    );

    // If resolved visual theme did not actually change (e.g., 'system' [dark] -> 'dark'), skip screen wipe
    if (currentResolvedIsDark.current === isDark) {
      updateAttributes(isDark);
      return;
    }

    animateThemeChange(isDark);
  }, [theme, getIsDark, updateAttributes, animateThemeChange, isBrowser, announce]);

  // Listen to system theme changes with cross-browser compatibility (addEventListener & addListener)
  useIsomorphicLayoutEffect(() => {
    if (!isBrowser || theme !== 'system') return undefined;

    try {
      if (typeof window.matchMedia !== 'function') return undefined;

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
        // Clear specific click position for system changes so it ripples smoothly from center
        lastInteraction.current = null;
        const isDark = 'matches' in e ? e.matches : mediaQuery.matches;
        announce(`System theme changed to ${isDark ? 'Dark' : 'Light'}`);
        if (currentResolvedIsDark.current !== isDark) {
          animateThemeChange(isDark);
        } else {
          updateAttributes(isDark);
        }
      };

      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleChange);
        return () => {
          mediaQuery.removeEventListener('change', handleChange);
        };
      }
      if (typeof (mediaQuery as any).addListener === 'function') {
        (mediaQuery as any).addListener(handleChange);
        return () => {
          (mediaQuery as any).removeListener(handleChange);
        };
      }
    } catch (err) {
      console.warn('[ThemeProvider] Error listening to system theme media query:', err);
    }

    return undefined;
  }, [theme, animateThemeChange, updateAttributes, isBrowser, announce]);

  // Global unmount cleanup for all pending timers, animation frames, and injected elements
  useIsomorphicLayoutEffect(() => {
    return () => {
      if (fallbackRafRef.current !== null) {
        window.cancelAnimationFrame(fallbackRafRef.current);
      }
      if (fallbackMidwayTimerRef.current !== null) {
        window.clearTimeout(fallbackMidwayTimerRef.current);
      }
      if (fallbackResetTimerRef.current !== null) {
        window.clearTimeout(fallbackResetTimerRef.current);
      }
      if (waveTimerRef.current !== null) {
        window.clearTimeout(waveTimerRef.current);
      }
      if (safetyTimerRef.current !== null) {
        window.clearTimeout(safetyTimerRef.current);
      }

      try {
        const pulse = document.getElementById('theme-wave-pulse');
        if (pulse && pulse.parentNode) {
          pulse.remove();
        }
        const overlay = document.getElementById('theme-transition-overlay');
        if (overlay && overlay.parentNode) {
          overlay.remove();
        }
      } catch {
        // Ignore DOM removal errors on unmount
      }
    };
  }, []);

  return (
    <>
      {/* Screen reader live announcement region for accessibility (zero re-render cost) */}
      <span
        ref={liveRegionRef}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />
      {children}
    </>
  );
};
