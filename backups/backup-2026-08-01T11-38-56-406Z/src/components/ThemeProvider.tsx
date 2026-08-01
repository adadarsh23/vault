import React, { useLayoutEffect, useCallback, useRef } from 'react'
import { useThemeStore } from '../store/themeStore'

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const theme = useThemeStore((state) => state.theme)
  const isFirstRender = useRef(true)
  const lastClick = useRef({ x: 0, y: 0 })
  const transitionInFlight = useRef(false)
  const overlayResetTimerRef = useRef<number | null>(null)

  // Track global clicks to determine animation origin
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const handleGlobalClick = (e: MouseEvent) => {
      lastClick.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('click', handleGlobalClick, { capture: true })
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

  // Utility: safe window check
  const isBrowser = typeof window !== 'undefined'

  // Resolve theme
  const getIsDark = useCallback(() => {
    if (!isBrowser) return false

    if (theme === 'dark') return true
    if (theme === 'light') return false

    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }, [theme, isBrowser])

  // Apply theme attributes (fast + minimal DOM updates)
  const updateAttributes = useCallback((isDark: boolean) => {
    if (!isBrowser) return

    const root = document.documentElement
    const newTheme = isDark ? 'dark' : 'light'

    // Avoid unnecessary DOM updates
    if (!root.classList.contains(newTheme)) {
      root.classList.remove('light', 'dark')
      root.classList.add(newTheme)
    }

    // Update all icon links for theme synchronization
    const iconPath = isDark ? '/favicon-dark.svg' : '/favicon.svg'
    const selectors = [
      "link[rel='icon']",
      "link[rel='apple-touch-icon']",
      "link[rel='shortcut icon']",
      "link[rel='alternate icon']",
      "link[rel='mask-icon']"
    ]

    selectors.forEach(selector => {
      const links = document.querySelectorAll(selector)
      links.forEach(link => {
        const hLink = link as HTMLLinkElement
        // Only update SVG icons if we have them, or just swap if it's a general icon
        if (hLink.type === 'image/svg+xml' || selector.includes('icon')) {
          hLink.href = iconPath
        }
      })
    })

    // Update theme-color meta tag for mobile browsers (brute force refresh)
    const themeColor = isDark ? '#0a0a0a' : '#ffffff'
    document.querySelectorAll("meta[name='theme-color']").forEach(meta => {
      (meta as HTMLMetaElement).content = themeColor
    })
  }, [isBrowser])

  const triggerThemeOverlay = useCallback((x: number, y: number) => {
    if (!isBrowser) return
    const overlay = document.getElementById('theme-transition-overlay')
    if (!overlay) return

    overlay.style.setProperty('--x', `${x}px`)
    overlay.style.setProperty('--y', `${y}px`)
    overlay.classList.remove('is-active')
    
    // Use animation frame rather than synchronous layout thrashing
    requestAnimationFrame(() => {
      overlay.classList.add('is-active')
    })

    if (overlayResetTimerRef.current !== null) {
      window.clearTimeout(overlayResetTimerRef.current)
    }
    overlayResetTimerRef.current = window.setTimeout(() => {
      overlay.classList.remove('is-active')
      overlayResetTimerRef.current = null
    }, 260)
  }, [isBrowser])

  // Animate theme change (cinematic ripple effect)
  const animateThemeChange = useCallback((isDark: boolean) => {
    if (!isBrowser) return

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    if (prefersReducedMotion || !('startViewTransition' in document)) {
      updateAttributes(isDark)
      return
    }

    const { x, y } = lastClick.current
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )

    if (transitionInFlight.current) {
      triggerThemeOverlay(x, y)
      updateAttributes(isDark)
      return
    }

    try {
      transitionInFlight.current = true
      // @ts-ignore
      const transition = document.startViewTransition(() => {
        triggerThemeOverlay(x, y)
        updateAttributes(isDark)
      })

      transition.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${endRadius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 700,
              easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
              pseudoElement: '::view-transition-new(root)',
            }
          )

          document.documentElement.animate(
            {
              transform: ['scale(1)', 'scale(0.98)'],
              opacity: [1, 0.7],
            },
            {
              duration: 700,
              easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
              pseudoElement: '::view-transition-old(root)',
            }
          )
        })
        .catch(() => {
          // A transition can be aborted when state changes quickly; fallback is already applied.
        })
        .finally(() => {
          transitionInFlight.current = false
        })

      transition.finished.catch(() => {
        transitionInFlight.current = false
      })
    } catch {
      transitionInFlight.current = false
      triggerThemeOverlay(x, y)
      updateAttributes(isDark)
    }
  }, [isBrowser, triggerThemeOverlay, updateAttributes])

  // Handle theme changes
  useLayoutEffect(() => {
    if (!isBrowser) return

    const isDark = getIsDark()

    if (isFirstRender.current) {
      updateAttributes(isDark)
      isFirstRender.current = false
      return
    }

    animateThemeChange(isDark)
  }, [theme, getIsDark, updateAttributes, animateThemeChange, isBrowser])

  // Listen to system theme changes
  useLayoutEffect(() => {
    if (!isBrowser || theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      animateThemeChange(e.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, animateThemeChange, isBrowser])

  useLayoutEffect(() => {
    return () => {
      if (overlayResetTimerRef.current !== null) {
        window.clearTimeout(overlayResetTimerRef.current)
      }
    }
  }, [])

  return <>{children}</>
}
