import { useState, useEffect } from 'react'
import { logger } from '../lib/logger'

const getInitialMatch = (query: string): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  try {
    return window.matchMedia(query).matches
  } catch (error) {
    logger.warn('Invalid media query provided', { query, error })
    return false
  }
}

export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => getInitialMatch(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setValue(false)
      return
    }

    let mediaQuery: MediaQueryList
    try {
      mediaQuery = window.matchMedia(query)
    } catch (error) {
      logger.warn('Unable to evaluate media query', { query, error })
      setValue(false)
      return
    }

    const onChange = (event: MediaQueryListEvent) => {
      setValue(event.matches)
    }

    setValue(mediaQuery.matches)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onChange)
      return () => mediaQuery.removeEventListener('change', onChange)
    }

    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(onChange)
      return () => mediaQuery.removeListener(onChange)
    }

    return
  }, [query])

  return value
}
