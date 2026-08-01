import { useCallback, useEffect, startTransition, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  GLOBAL_NAVIGATION_EVENT,
  mapItemTypeToTab,
} from '../../lib/global-navigation'
import { VaultItem } from '../../lib/storage'
import { useGlobalNavigationStore } from '../../store/globalNavigationStore'

export const TAB_PATHS = {
  dashboard: '/',
  notes: '/notes',
  chats: '/chats',
  todos: '/todos',
  passwords: '/passwords',
  secrets: '/secrets',
  contacts: '/contacts',
  photos: '/photos',
  videos: '/videos',
  audio: '/audio',
  documents: '/documents',
  locations: '/locations',
  files: '/files',
  cards: '/cards',
  identities: '/identities',
  wifi: '/wifi',
  settings: '/settings',
  shortcuts: '/shortcuts',
  privacy: '/privacy',
  systemlogs: '/system-logs',
  devicesessions: '/device-sessions',
  ecosystem: '/eco',
  legal: '/legal',
  contact: '/contact',
} as const

export type TabId = keyof typeof TAB_PATHS

const validTabs: TabId[] = []
const PATH_TO_TAB_MAP: Record<string, TabId> = {}

for (const tab in TAB_PATHS) {
  if (!Object.prototype.hasOwnProperty.call(TAB_PATHS, tab)) {
    continue
  }

  const typedTab = tab as TabId
  const path = TAB_PATHS[typedTab]

  if (typeof path !== 'string') {
    continue
  }

  validTabs.push(typedTab)
  PATH_TO_TAB_MAP[path] = typedTab
}

const validTabSet = new Set(validTabs)
export const TAB_PATH_VALUES: readonly string[] = validTabs.map(
  (tab) => TAB_PATHS[tab],
)

/** Get tab from pathname safely (O(1)) */
export const getTabFromPathname = (pathname: string): TabId | null => {
  return PATH_TO_TAB_MAP[pathname] ?? null
}

export const getPathnameForTab = (tab: TabId) => TAB_PATHS[tab]

export const isTabId = (value: string): value is TabId =>
  validTabSet.has(value as TabId)

/** Safe parser for "tab#hash" */
const parseTabPath = (
  tabPath: string,
): { tab: TabId; hash: string } | null => {
  if (!tabPath || typeof tabPath !== 'string') return null

  const [rawTab, rawHash] = tabPath.split('#')

  if (!rawTab || !isTabId(rawTab)) return null

  return {
    tab: rawTab,
    hash: rawHash ? `#${encodeURIComponent(rawHash)}` : '',
  }
}

export function useNavigationHandler() {
  const location = useLocation()
  const navigate = useNavigate()

  const setTargetItemId = useGlobalNavigationStore(
    (state) => state.setTargetItemId,
  )

  /** Memoized active tab */
  const activeTab = useMemo(
    () => getTabFromPathname(location.pathname) ?? 'dashboard',
    [location.pathname],
  )

  /** Core navigation */
  const navigateToTab = useCallback(
    (tabPath: string) => {
      const parsed = parseTabPath(tabPath)
      if (!parsed) return

      const { tab, hash } = parsed
      const pathname = getPathnameForTab(tab)

      // Prevent unnecessary navigation
      if (location.pathname === pathname && location.hash === hash) {
        return
      }

      startTransition(() => {
        navigate(
          {
            pathname,
            hash,
          },
          {
            replace: false,
          },
        )
      })
    },
    [navigate, location.pathname, location.hash],
  )

  /** External-safe navigation (future-proof wrapper) */
  const safeNavigateToTab = useCallback(
    (tabPath: string) => {
      try {
        navigateToTab(tabPath)
      } catch (error) {
        if (import.meta.env.MODE !== 'production') {
          console.error('Navigation error:', error)
        }
      }
    },
    [navigateToTab],
  )

  /** Global navigation event handler */
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handler = (event: Event) => {
      if (!(event instanceof CustomEvent)) return

      const item = event.detail as VaultItem | undefined
      if (!item?.id || !item.type) return

      const tabPath = mapItemTypeToTab(item.type)
      if (!tabPath) return

      // Batch update (React concurrent safe)
      startTransition(() => {
        safeNavigateToTab(tabPath)
        setTargetItemId(item.id)
      })
    }

    window.addEventListener(GLOBAL_NAVIGATION_EVENT, handler)

    return () => {
      window.removeEventListener(GLOBAL_NAVIGATION_EVENT, handler)
    }
  }, [safeNavigateToTab, setTargetItemId])

  return {
    activeTab,
    location,
    navigateToTab,
    safeNavigateToTab,
  }
}
