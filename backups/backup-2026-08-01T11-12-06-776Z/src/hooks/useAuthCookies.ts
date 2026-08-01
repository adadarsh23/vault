import { useCallback, useMemo } from 'react'
import {
  clearAuthCookies,
  persistAuthCookies,
  readAuthCookies,
  type PersistAuthCookieInput,
} from '../lib/auth-cookie-manager'
import { logger } from '../lib/logger'

export interface UseAuthCookiesApi {
  read: () => ReturnType<typeof readAuthCookies>
  persist: (input: PersistAuthCookieInput) => void
  clear: () => void
}

export const useAuthCookies = (): UseAuthCookiesApi => {
  const read = useCallback(() => {
    try {
      return readAuthCookies()
    } catch (error) {
      logger.warn('Failed to read auth cookies', { error })
      return { rememberMe: false }
    }
  }, [])

  const persist = useCallback((input: PersistAuthCookieInput) => {
    try {
      persistAuthCookies(input)
    } catch (error) {
      logger.warn('Failed to persist auth cookies', { error })
    }
  }, [])

  const clear = useCallback(() => {
    try {
      clearAuthCookies()
    } catch (error) {
      logger.warn('Failed to clear auth cookies', { error })
    }
  }, [])

  return useMemo(
    () => ({
      read,
      persist,
      clear,
    }),
    [clear, persist, read],
  )
}
