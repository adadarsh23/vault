import { useCallback, useEffect, startTransition, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GLOBAL_NAVIGATION_EVENT, mapItemTypeToTab } from '../../lib/global-navigation';
import { VaultItem } from '../../lib/storage';
import { useGlobalNavigationStore } from '../../store/globalNavigationStore';
import { logger } from '../../lib/logger';

export const TAB_PATHS = {
  // Main
  dashboard: '/',

  // Personal Information
  identities: '/identities',
  contacts: '/contacts',
  passwords: '/passwords',
  cards: '/cards',
  wifi: '/wifi',
  secrets: '/secrets',

  // Notes & Productivity
  notes: '/notes',
  todos: '/todos',
  chats: '/chats',
  locations: '/locations',

  // Media
  photos: '/photos',
  videos: '/videos',
  audio: '/audio',

  // Documents & Files
  documents: '/documents',
  files: '/files',

  // App
  privacy: '/privacy',
  shortcuts: '/shortcuts',
  settings: '/settings',

  // System & Other
  systemlogs: '/system-logs',
  devicesessions: '/device-sessions',
  ecosystem: '/eco',
  legal: '/legal',
  contact: '/contact',
} as const;

export type TabId = keyof typeof TAB_PATHS;

const validTabs: TabId[] = [];
const PATH_TO_TAB_MAP: Record<string, TabId> = {};

for (const tab in TAB_PATHS) {
  if (!Object.prototype.hasOwnProperty.call(TAB_PATHS, tab)) {
    continue;
  }

  const typedTab = tab as TabId;
  const path = TAB_PATHS[typedTab];

  if (typeof path !== 'string') {
    continue;
  }

  validTabs.push(typedTab);
  PATH_TO_TAB_MAP[path] = typedTab;
}

const validTabSet = new Set(validTabs);
export const TAB_PATH_VALUES: readonly string[] = validTabs.map((tab) => TAB_PATHS[tab]);

/** Get tab from pathname safely (O(1)) */
export const getTabFromPathname = (pathname: string): TabId | null => {
  if (!pathname) return null;
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return PATH_TO_TAB_MAP[normalized] ?? null;
};

export const getPathnameForTab = (tab: TabId): string => TAB_PATHS[tab] ?? '/';

export const isTabId = (value: string): value is TabId => validTabSet.has(value as TabId);

/** Safe parser supporting tab ID ('passwords'), path ('/passwords'), and item type ('password') */
const parseTabPath = (tabPath: string): { tab: TabId; hash: string; search: string } | null => {
  if (!tabPath || typeof tabPath !== 'string') return null;

  const [pathAndQuery, rawHash] = tabPath.trim().split('#');
  if (!pathAndQuery) return null;

  const [rawTab, rawSearch] = pathAndQuery.split('?');
  const normalizedTab = (rawTab || '').trim();
  if (!normalizedTab) return null;

  let tabKey: TabId | null = isTabId(normalizedTab) ? (normalizedTab as TabId) : null;

  // Try matching directly from route pathname (e.g. '/passwords' or 'passwords')
  if (!tabKey) {
    const fromPath = getTabFromPathname(
      normalizedTab.startsWith('/') ? normalizedTab : `/${normalizedTab}`,
    );
    if (fromPath) {
      tabKey = fromPath;
    }
  }

  // Try mapping vault item type (e.g. 'card' -> 'cards')
  if (!tabKey) {
    const mapped = mapItemTypeToTab(normalizedTab as VaultItem['type']);
    if (isTabId(mapped)) {
      tabKey = mapped as TabId;
    }
  }

  if (!tabKey) return null;

  let safeHash = '';
  if (rawHash) {
    try {
      safeHash = `#${encodeURI(decodeURIComponent(rawHash))}`;
    } catch {
      safeHash = `#${encodeURI(rawHash)}`;
    }
  }

  return {
    tab: tabKey,
    hash: safeHash,
    search: rawSearch ? `?${rawSearch}` : '',
  };
};

export function useNavigationHandler() {
  const location = useLocation();
  const navigate = useNavigate();

  const setTargetItemId = useGlobalNavigationStore((state) => state.setTargetItemId);

  /** Memoized active tab */
  const activeTab = useMemo(
    () => getTabFromPathname(location.pathname) ?? 'dashboard',
    [location.pathname],
  );

  /** Core navigation */
  const navigateToTab = useCallback(
    (tabPath: string) => {
      const parsed = parseTabPath(tabPath);
      if (!parsed) return;

      const { tab, hash, search } = parsed;
      const pathname = getPathnameForTab(tab);

      // Prevent redundant navigation
      if (
        location.pathname === pathname &&
        (location.hash || '') === hash &&
        (location.search || '') === search
      ) {
        return;
      }

      try {
        navigate(
          {
            pathname,
            hash,
            search,
          },
          {
            replace: false,
          },
        );
      } catch (error) {
        logger.error('Failed to navigate to tab', { error, tabPath });
      }
    },
    [navigate, location.pathname, location.hash, location.search],
  );

  /** External-safe navigation wrapper */
  const safeNavigateToTab = useCallback(
    (tabPath: string) => {
      try {
        navigateToTab(tabPath);
      } catch (error) {
        logger.error('Safe navigation error:', { error, tabPath });
      }
    },
    [navigateToTab],
  );

  /** Global navigation event handler */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: Event) => {
      try {
        if (!(event instanceof CustomEvent)) return;

        const item = event.detail as VaultItem | undefined;
        if (!item?.id || !item.type) return;

        const tabPath = mapItemTypeToTab(item.type);
        if (!tabPath) return;

        // Batch update (React concurrent safe)
        startTransition(() => {
          safeNavigateToTab(tabPath);
          setTargetItemId(item.id);
        });
      } catch (err) {
        logger.error('Error handling global navigation event', { error: err });
      }
    };

    window.addEventListener(GLOBAL_NAVIGATION_EVENT, handler);

    return () => {
      window.removeEventListener(GLOBAL_NAVIGATION_EVENT, handler);
    };
  }, [safeNavigateToTab, setTargetItemId]);

  return useMemo(
    () => ({
      activeTab,
      location,
      navigateToTab,
      safeNavigateToTab,
    }),
    [activeTab, location, navigateToTab, safeNavigateToTab],
  );
}
