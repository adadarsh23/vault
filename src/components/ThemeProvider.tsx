import React, { useLayoutEffect, useCallback, useRef } from 'react';
import { useThemeStore } from '../store/themeStore';

declare global {
  interface Window {
    __recordThemeToggleOrigin?: (x: number, y: number) => void;
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useThemeStore((state) => state.theme);
  const isFirstRender = useRef(true);
  const currentResolvedIsDark = useRef<boolean | null>(null);
  const lastInteraction = useRef<{ x: number; y: number } | null>(null);
  const transitionInFlight = useRef(false);
  const overlayResetTimerRef = useRef<number | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = React.useState<string>('');

  const isBrowser = typeof window !== 'undefined';

  // Multi-input coordinate tracking (pointer, touch, mouse, stylus, and keyboard focus)
  useLayoutEffect(() => {
    if (!isBrowser) return;

    const recordCoords = (clientX: number, clientY: number) => {
      if (
        typeof clientX === 'number' &&
        typeof clientY === 'number' &&
        !isNaN(clientX) &&
        !isNaN(clientY) &&
        (clientX > 0 || clientY > 0)
      ) {
        lastInteraction.current = { x: Math.round(clientX), y: Math.round(clientY) };
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      recordCoords(e.clientX, e.clientY);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        recordCoords(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (e.clientX > 0 || e.clientY > 0) {
        recordCoords(e.clientX, e.clientY);
      } else if (e.target && e.target instanceof HTMLElement) {
        const rect = e.target.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          recordCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        const active = document.activeElement;
        if (active && active instanceof HTMLElement && active !== document.body) {
          const rect = active.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            recordCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
          }
        }
      }
    };

    // Expose explicit origin recorder for components like Sidebar
    window.__recordThemeToggleOrigin = (x: number, y: number) => {
      recordCoords(x, y);
    };

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    window.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    window.addEventListener('click', handleClick, { capture: true, passive: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('touchstart', handleTouchStart, { capture: true });
      window.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      delete window.__recordThemeToggleOrigin;
    };
  }, [isBrowser]);

  // Resolve theme
  const getIsDark = useCallback(() => {
    if (!isBrowser) return false;

    if (theme === 'dark') return true;
    if (theme === 'light') return false;

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [theme, isBrowser]);

  // Apply theme attributes (fast + minimal DOM updates)
  const updateAttributes = useCallback(
    (isDark: boolean) => {
      if (!isBrowser) return;

      const root = document.documentElement;
      const newTheme = isDark ? 'dark' : 'light';
      const oldTheme = isDark ? 'light' : 'dark';

      root.classList.remove(oldTheme);
      root.classList.add(newTheme);
      root.setAttribute('data-theme', newTheme);
      currentResolvedIsDark.current = isDark;

      // Update all icon links for theme synchronization
      const iconPath = isDark ? '/favicon-dark.svg' : '/favicon.svg';
      const selectors = [
        "link[rel='icon']",
        "link[rel='apple-touch-icon']",
        "link[rel='shortcut icon']",
        "link[rel='alternate icon']",
        "link[rel='mask-icon']",
      ];

      selectors.forEach((selector) => {
        const links = document.querySelectorAll(selector);
        links.forEach((link) => {
          const hLink = link as HTMLLinkElement;
          if (hLink.type === 'image/svg+xml' || selector.includes('icon')) {
            hLink.href = iconPath;
          }
        });
      });

      // Update theme-color meta tag for mobile browser address bars
      const themeColor = isDark ? '#0a0a0a' : '#ffffff';
      document.querySelectorAll("meta[name='theme-color']").forEach((meta) => {
        (meta as HTMLMetaElement).content = themeColor;
      });
    },
    [isBrowser],
  );

  // Calculate coordinates and max radius to cover all 4 screen corners on any device / DPR / viewport
  const getOriginAndRadius = useCallback(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const vw = Math.max(
      vv?.width || 0,
      document.documentElement.clientWidth || 0,
      window.innerWidth || 0,
    );
    const vh = Math.max(
      vv?.height || 0,
      document.documentElement.clientHeight || 0,
      window.innerHeight || 0,
    );

    let x = lastInteraction.current?.x;
    let y = lastInteraction.current?.y;

    // If no interaction recorded or coordinates are non-positive, inspect activeElement
    if (typeof x !== 'number' || typeof y !== 'number' || (x <= 0 && y <= 0)) {
      if (
        document.activeElement &&
        document.activeElement !== document.body &&
        document.activeElement !== document.documentElement &&
        document.activeElement instanceof HTMLElement
      ) {
        const rect = document.activeElement.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          x = Math.round(rect.left + rect.width / 2);
          y = Math.round(rect.top + rect.height / 2);
        }
      }
    }

    if (typeof x !== 'number' || isNaN(x) || x < 0) x = Math.round(vw / 2);
    if (typeof y !== 'number' || isNaN(y) || y < 0) y = Math.round(vh / 2);

    // Clamp coordinates within visible bounds
    x = Math.max(0, Math.min(vw, x));
    y = Math.max(0, Math.min(vh, y));

    // Calculate maximum distance to the 4 corners with a 5% margin + 16px to cover extreme corners on high-DPI displays
    const maxDistX = Math.max(x, vw - x);
    const maxDistY = Math.max(y, vh - y);
    const endRadius = Math.ceil(Math.hypot(maxDistX, maxDistY) * 1.05) + 16;

    // Reset interaction coordinate after consuming
    lastInteraction.current = null;

    return { x, y, endRadius };
  }, []);

  // Trigger subtle ambient ripple wave on theme shift (GPU-optimized)
  const triggerThemeWave = useCallback((x: number, y: number, isDark: boolean) => {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById('theme-wave-pulse');
    if (existing) existing.remove();

    const pulse = document.createElement('div');
    pulse.id = 'theme-wave-pulse';
    pulse.style.setProperty('--origin-x', `${x}px`);
    pulse.style.setProperty('--origin-y', `${y}px`);
    pulse.className = isDark ? 'is-dark' : 'is-light';
    document.body.appendChild(pulse);

    setTimeout(() => {
      if (pulse.parentNode) {
        pulse.remove();
      }
    }, 550);
  }, []);

  // Fallback animation for browsers without View Transitions API (Firefox, older Safari, WebViews)
  const runFallbackAnimation = useCallback(
    (isDark: boolean) => {
      if (!isBrowser) return;

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

      if (overlayResetTimerRef.current !== null) {
        window.clearTimeout(overlayResetTimerRef.current);
      }

      requestAnimationFrame(() => {
        if (!overlay) return;
        overlay.style.clipPath = `circle(${endRadius}px at ${x}px ${y}px)`;
        overlay.style.setProperty('-webkit-clip-path', `circle(${endRadius}px at ${x}px ${y}px)`);

        // Midway through transition, swap theme attributes seamlessly
        setTimeout(() => {
          updateAttributes(isDark);
        }, 220);

        // After completion, cleanly reset overlay
        overlayResetTimerRef.current = window.setTimeout(() => {
          if (overlay) {
            overlay.classList.remove('is-active');
            overlay.style.clipPath = '';
            overlay.style.removeProperty('-webkit-clip-path');
          }
          overlayResetTimerRef.current = null;
        }, 480);
      });
    },
    [isBrowser, getOriginAndRadius, triggerThemeWave, updateAttributes],
  );

  // Animate theme change with universal cross-browser View Transitions support
  const animateThemeChange = useCallback(
    (isDark: boolean) => {
      if (!isBrowser) return;

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReducedMotion) {
        updateAttributes(isDark);
        return;
      }

      const { x, y, endRadius } = getOriginAndRadius();

      // Check for native View Transitions API
      if (
        !('startViewTransition' in document) ||
        typeof (document as any).startViewTransition !== 'function'
      ) {
        runFallbackAnimation(isDark);
        return;
      }

      if (transitionInFlight.current) {
        updateAttributes(isDark);
        return;
      }

      try {
        transitionInFlight.current = true;
        triggerThemeWave(x, y, isDark);

        // Pass CSS variables so CSS keyframes work automatically across Safari 18+, iOS 18+, and Chromium
        const root = document.documentElement;
        root.style.setProperty('--theme-origin-x', `${x}px`);
        root.style.setProperty('--theme-origin-y', `${y}px`);
        root.style.setProperty('--theme-end-radius', `${endRadius}px`);

        // Suppress conflicting sub-transitions on document while capturing snapshot
        root.classList.add('theme-switching');

        // @ts-ignore
        const transition = document.startViewTransition(() => {
          updateAttributes(isDark);
        });

        const cleanup = () => {
          transitionInFlight.current = false;
          root.classList.remove('theme-switching');
          root.style.removeProperty('--theme-origin-x');
          root.style.removeProperty('--theme-origin-y');
          root.style.removeProperty('--theme-end-radius');
        };

        if (transition && transition.ready && typeof transition.ready.then === 'function') {
          transition.ready
            .then(() => {
              // Attempt WAAPI animation for browsers supporting pseudoElement (Chromium);
              // Safari 18+ uses the CSS @keyframes defined in index.css automatically.
              try {
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

                animation.finished.then(() => cleanup()).catch(() => cleanup());
              } catch {
                // If WAAPI pseudoElement is not supported (Safari/iOS), CSS keyframes take over
              }
            })
            .catch(() => {
              cleanup();
            });

          if (transition.finished && typeof transition.finished.then === 'function') {
            transition.finished.finally(() => {
              cleanup();
            });
          }
        } else {
          cleanup();
        }
      } catch {
        transitionInFlight.current = false;
        document.documentElement.classList.remove('theme-switching');
        updateAttributes(isDark);
      }
    },
    [isBrowser, getOriginAndRadius, runFallbackAnimation, triggerThemeWave, updateAttributes],
  );

  // Handle theme changes
  useLayoutEffect(() => {
    if (!isBrowser) return;

    const isDark = getIsDark();

    if (isFirstRender.current) {
      updateAttributes(isDark);
      isFirstRender.current = false;
      return;
    }

    // Set screen reader auditory announcement
    setLiveAnnouncement(
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
  }, [theme, getIsDark, updateAttributes, animateThemeChange, isBrowser]);

  // Listen to system theme changes
  useLayoutEffect(() => {
    if (!isBrowser || theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      // Clear specific click position for system changes to ripple from center
      lastInteraction.current = null;
      const isDark = e.matches;
      setLiveAnnouncement(`System theme changed to ${isDark ? 'Dark' : 'Light'}`);
      if (currentResolvedIsDark.current !== isDark) {
        animateThemeChange(isDark);
      } else {
        updateAttributes(isDark);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, animateThemeChange, updateAttributes, isBrowser]);

  useLayoutEffect(() => {
    return () => {
      if (overlayResetTimerRef.current !== null) {
        window.clearTimeout(overlayResetTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      {/* Screen reader live announcement region for accessibility */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </span>
      {children}
    </>
  );
};
