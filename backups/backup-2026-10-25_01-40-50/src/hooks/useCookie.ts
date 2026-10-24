import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  type CookieOptions,
  deleteCookie,
  getCookie,
  hasCookie,
  setCookie,
  updateCookie,
} from '../lib/cookie-utils';
import { logger } from '../lib/logger';

export interface UseCookieApi {
  value: string | null;
  exists: boolean;
  set: (value: string, options?: CookieOptions) => boolean;
  update: (value: string, options?: CookieOptions) => boolean;
  remove: (options?: CookieOptions) => boolean;
  refresh: () => void;
}

const safeReadCookie = (name: string): string | null => {
  try {
    return getCookie(name);
  } catch (error) {
    logger.warn('Failed to read cookie in hook', { name, error });
    return null;
  }
};

export const useCookie = (name: string, baseOptions?: CookieOptions): UseCookieApi => {
  const [value, setValue] = useState<string | null>(() => safeReadCookie(name));

  const baseOptionsRef = useRef(baseOptions);
  useEffect(() => {
    baseOptionsRef.current = baseOptions;
  }, [baseOptions]);

  // Synchronize state if cookie name prop changes dynamically
  useEffect(() => {
    setValue(safeReadCookie(name));
  }, [name]);

  const refresh = useCallback(() => {
    setValue(safeReadCookie(name));
  }, [name]);

  const set = useCallback(
    (nextValue: string, options?: CookieOptions) => {
      try {
        const merged = { ...baseOptionsRef.current, ...options };
        const success = setCookie(name, nextValue, merged);
        if (success) {
          setValue(nextValue);
        }
        return success;
      } catch (error) {
        logger.warn('Failed to set cookie via hook', { name, error });
        return false;
      }
    },
    [name],
  );

  const update = useCallback(
    (nextValue: string, options?: CookieOptions) => {
      try {
        const merged = { ...baseOptionsRef.current, ...options };
        const success = updateCookie(name, nextValue, merged);
        if (success) {
          setValue(nextValue);
        }
        return success;
      } catch (error) {
        logger.warn('Failed to update cookie via hook', { name, error });
        return false;
      }
    },
    [name],
  );

  const remove = useCallback(
    (options?: CookieOptions) => {
      try {
        const merged = { ...baseOptionsRef.current, ...options };
        const success = deleteCookie(name, merged);
        if (success) {
          setValue(null);
        }
        return success;
      } catch (error) {
        logger.warn('Failed to remove cookie via hook', { name, error });
        return false;
      }
    },
    [name],
  );

  const exists = useMemo(() => {
    if (value !== null) {
      return true;
    }

    try {
      return hasCookie(name);
    } catch (error) {
      logger.warn('Failed to evaluate cookie existence', { name, error });
      return false;
    }
  }, [name, value]);

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
  );
};
