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
  const lastInteraction = useRef<{ x: number; y: number } | null>(null);
  const transitionInFlight = useRef(false);
  const overlayResetTimerRef = useRef<number | null>(null);

  const isBrowser = typeof window !== 'undefined';

  // Multi-input coordinate tracking (touch, pointer, mouse, stylus)
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
      recordCoords(e.clientX, e.clientY);
    };

    // Expose explicit origin recorder for components like Sidebar
    window.__recordThemeToggleOrigin = (x: number, y: number) => {
      recordCoords(x, y);
    };

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    window.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    window.addEventListener('click', handleClick, { capture: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('touchstart', handleTouchStart, { capture: true });
      window.removeEventListener('click', handleClick, { capture: true });
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

      if (!root.classList.contains(newTheme)) {
        root.classList.remove('light', 'dark');
        root.classList.add(newTheme);
      }

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

      // Update theme-color meta tag for mobile browsers
      const themeColor = isDark ? '#0a0a0a' : '#ffffff';
      document.querySelectorAll("meta[name='theme-color']").forEach((meta) => {
        (meta as HTMLMetaElement).content = themeColor;
      });
    },
    [isBrowser],
  );

  // Calculate coordinates and max radius to cover all 4 screen corners on any device
  const getOriginAndRadius = useCallback(() => {
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

    const x =
      lastInteraction.current && (lastInteraction.current.x > 0 || lastInteraction.current.y > 0)
        ? lastInteraction.current.x
        : Math.round(vw / 2);

    const y =
      lastInteraction.current && (lastInteraction.current.x > 0 || lastInteraction.current.y > 0)
        ? lastInteraction.current.y
        : Math.round(vh / 2);

    const endRadius = Math.ceil(Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y)));

    return { x, y, endRadius };
  }, []);

  // Trigger subtle ambient ripple wave on theme shift
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
      pulse.remove();
    }, 600);
  }, []);

  // Fallback animation for browsers without View Transitions API (Firefox, Safari < 18, etc.)
  const runFallbackAnimation = useCallback(
    (isDark: boolean) => {
      if (!isBrowser) return;

      const overlay = document.getElementById('theme-transition-overlay');
      if (!overlay) {
        updateAttributes(isDark);
        return;
      }

      const { x, y, endRadius } = getOriginAndRadius();
      const targetBgColor = isDark ? '#0a0a0a' : '#ffffff';

      triggerThemeWave(x, y, isDark);

      overlay.style.backgroundColor = targetBgColor;
      overlay.style.clipPath = `circle(0px at ${x}px ${y}px)`;
      overlay.classList.add('is-active');

      if (overlayResetTimerRef.current !== null) {
        window.clearTimeout(overlayResetTimerRef.current);
      }

      requestAnimationFrame(() => {
        overlay.style.clipPath = `circle(${endRadius}px at ${x}px ${y}px)`;

        // Halfway through animation, swap document theme attributes
        setTimeout(() => {
          updateAttributes(isDark);
        }, 240);

        // After completion, cleanly hide overlay
        overlayResetTimerRef.current = window.setTimeout(() => {
          overlay.classList.remove('is-active');
          overlay.style.clipPath = '';
          overlayResetTimerRef.current = null;
        }, 520);
      });
    },
    [isBrowser, getOriginAndRadius, triggerThemeWave, updateAttributes],
  );

  // Animate theme change
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

        // Suppress conflicting sub-transitions on document while capturing snapshot
        document.documentElement.classList.add('theme-switching');

        // @ts-ignore
        const transition = document.startViewTransition(() => {
          updateAttributes(isDark);
        });

        const cleanup = () => {
          transitionInFlight.current = false;
          document.documentElement.classList.remove('theme-switching');
        };

        transition.ready
          .then(() => {
            const animation = document.documentElement.animate(
              {
                clipPath: [
                  `circle(0px at ${x}px ${y}px)`,
                  `circle(${endRadius}px at ${x}px ${y}px)`,
                ],
              },
              {
                duration: 520,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                pseudoElement: '::view-transition-new(root)',
                fill: 'forwards',
              },
            );

            animation.finished.finally(() => {
              cleanup();
            });
          })
          .catch(() => {
            cleanup();
          });

        transition.finished.finally(() => {
          cleanup();
        });
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

    animateThemeChange(isDark);
  }, [theme, getIsDark, updateAttributes, animateThemeChange, isBrowser]);

  // Listen to system theme changes
  useLayoutEffect(() => {
    if (!isBrowser || theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      // Clear specific click position for system changes to ripple from center
      lastInteraction.current = null;
      animateThemeChange(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, animateThemeChange, isBrowser]);

  useLayoutEffect(() => {
    return () => {
      if (overlayResetTimerRef.current !== null) {
        window.clearTimeout(overlayResetTimerRef.current);
      }
    };
  }, []);

  return <>{children}</>;
};
