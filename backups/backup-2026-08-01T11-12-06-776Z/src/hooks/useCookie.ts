import { useCallback, useMemo, useState } from 'react'
import {
  type CookieOptions,
  deleteCookie,
  getCookie,
  hasCookie,
  setCookie,
  updateCookie,
} from '../lib/cookie-utils'
import { logger } from '../lib/logger'

export interface UseCookieApi {
  value: string | null
  exists: boolean
  set: (value: string, options?: CookieOptions) => boolean
  update: (value: string, options?: CookieOptions) => boolean
  remove: (options?: CookieOptions) => boolean
  refresh: () => void
}

export const useCookie = (
  name: string,
  baseOptions?: CookieOptions,
): UseCookieApi => {
  const [value, setValue] = useState<string | null>(() => {
    try {
      return getCookie(name)
    } catch (error) {
      logger.warn('Failed to read cookie in hook initializer', { name, error })
      return null
    }
  })

  const refresh = useCallback(() => {
    try {
      setValue(getCookie(name))
    } catch (error) {
      logger.warn('Failed to refresh cookie value', { name, error })
      setValue(null)
    }
  }, [name])

  const set = useCallback(
    (nextValue: string, options?: CookieOptions) => {
      try {
        const success = setCookie(name, nextValue, { ...baseOptions, ...options })
        if (success) {
          setValue(nextValue)
        }
        return success
      } catch (error) {
        logger.warn('Failed to set cookie via hook', { name, error })
        return false
      }
    },
    [baseOptions, name],
  )

  const update = useCallback(
    (nextValue: string, options?: CookieOptions) => {
      try {
        const success = updateCookie(name, nextValue, {
          ...baseOptions,
          ...options,
        })
        if (success) {
          setValue(nextValue)
        }
        return success
      } catch (error) {
        logger.warn('Failed to update cookie via hook', { name, error })
        return false
      }
    },
    [baseOptions, name],
  )

  const remove = useCallback(
    (options?: CookieOptions) => {
      try {
        const success = deleteCookie(name, { ...baseOptions, ...options })
        if (success) {
          setValue(null)
        }
        return success
      } catch (error) {
        logger.warn('Failed to remove cookie via hook', { name, error })
        return false
      }
    },
    [baseOptions, name],
  )

  const exists = useMemo(() => {
    if (value !== null) {
      return true
    }

    try {
      return hasCookie(name)
    } catch (error) {
      logger.warn('Failed to evaluate cookie existence', { name, error })
      return false
    }
  }, [name, value])

  return useMemo(
    () => ({
      value,
      exists,
      set,
      update,
      remove,
      refresh,
    }),
    [exists, refresh, remove, set, update, value],
  )
}
