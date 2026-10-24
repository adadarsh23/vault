import { useCallback, useSyncExternalStore } from 'react';
import { logger } from '../lib/logger';

const getServerSnapshot = (): boolean => false;

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (
        !query ||
        typeof query !== 'string' ||
        typeof window === 'undefined' ||
        typeof window.matchMedia !== 'function'
      ) {
        return () => {};
      }

      let mediaQuery: MediaQueryList;
      try {
        mediaQuery = window.matchMedia(query);
      } catch (error) {
        logger.warn('Unable to evaluate media query', { query, error });
        return () => {};
      }

      const onChange = () => {
        onStoreChange();
      };

      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', onChange);
        return () => mediaQuery.removeEventListener('change', onChange);
      }

      if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(onChange);
        return () => mediaQuery.removeListener(onChange);
      }

      return () => {};
    },
    [query],
  );

  const getSnapshot = useCallback((): boolean => {
    if (
      !query ||
      typeof query !== 'string' ||
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return false;
    }
    try {
      return window.matchMedia(query).matches;
    } catch (error) {
      logger.warn('Invalid media query provided', { query, error });
      return false;
    }
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
