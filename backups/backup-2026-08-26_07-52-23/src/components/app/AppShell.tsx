import React, { lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Route, Routes } from 'react-router-dom';
import { Sidebar } from '../layout/Sidebar';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { ErrorFallback } from '../ui/ErrorFallback';
import type { TabId } from './NavigationHandler';
import { cn } from '../../lib/utils';
import { useVaultStore } from '../../store/vaultStore';
import { getAuthenticatedProfile } from '../../lib/auth-api';
import { useNotificationStore } from '../../store/notificationStore';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';
import { Lock, X } from 'lucide-react';
import { AppHeader } from './AppHeader';
import { LoadingScreen } from './LoadingScreen';
import { VaultIntegrityAlarmModal } from '../security/VaultIntegrityAlarmModal';
import { VaultIntegrityAlarmBanner } from '../security/VaultIntegrityAlarmBanner';

const MaintenanceModal = lazy(() =>
  import('../vault/MaintenanceModal').then((m) => ({
    default: m.MaintenanceModal || (m as any).default,
  })),
);
const CommandPalette = lazy(() =>
  import('../vault/CommandPalette').then((m) => ({
    default: m.CommandPalette || (m as any).default,
  })),
);

// Main
const Dashboard = lazy(() =>
  import('../../features/vault/Dashboard').then((m) => ({
    default: m.Dashboard || (m as any).default,
  })),
);

// Personal Information
const IdentitiesVault = lazy(() =>
  import('../../features/vault/IdentitiesVault').then((m) => ({
    default: m.IdentitiesVault || (m as any).default,
  })),
);
const ContactsVault = lazy(() =>
  import('../../features/vault/ContactsVault').then((m) => ({
    default: m.ContactsVault || (m as any).default,
  })),
);
const PasswordManager = lazy(() =>
  import('../../features/vault/PasswordManager').then((m) => ({
    default: m.PasswordManager || (m as any).default,
  })),
);
const CardsVault = lazy(() =>
  import('../../features/vault/CardsVault').then((m) => ({
    default: m.CardsVault || (m as any).default,
  })),
);
const WifiVault = lazy(() =>
  import('../../features/vault/WifiVault').then((m) => ({
    default: m.WifiVault || (m as any).default,
  })),
);
const SecretsVault = lazy(() =>
  import('../../features/vault/SecretsVault').then((m) => ({
    default: m.SecretsVault || (m as any).default,
  })),
);

// Notes & Productivity
const NotesVault = lazy(() =>
  import('../../features/vault/NotesVault').then((m) => ({
    default: m.NotesVault || (m as any).default,
  })),
);
const TodoVault = lazy(() =>
  import('../../features/vault/TodoVault').then((m) => ({
    default: m.TodoVault || (m as any).default,
  })),
);
const ChatVault = lazy(() =>
  import('../../features/vault/ChatVault').then((m) => ({
    default: m.ChatVault || (m as any).default,
  })),
);
const LocationVault = lazy(() =>
  import('../../features/vault/LocationVault').then((m) => ({
    default: m.LocationVault || (m as any).default,
  })),
);

// Media
const MediaVault = lazy(() =>
  import('../../features/vault/MediaVault').then((m) => ({
    default: m.MediaVault || (m as any).default,
  })),
);
const AudioVault = lazy(() =>
  import('../../features/vault/AudioVault').then((m) => ({
    default: m.AudioVault || (m as any).default,
  })),
);

// Documents & Files
const DocumentsVault = lazy(() =>
  import('../../features/vault/DocumentsVault').then((m) => ({
    default: m.DocumentsVault || (m as any).default,
  })),
);
const OtherFilesVault = lazy(() =>
  import('../../features/vault/OtherFilesVault').then((m) => ({
    default: m.OtherFilesVault || (m as any).default,
  })),
);

// App
const PrivacyInterfacePage = lazy(() =>
  import('../../features/vault/PrivacyInterfacePage').then((m) => ({
    default: m.PrivacyInterfacePage || (m as any).default,
  })),
);
const ShortcutsPage = lazy(() =>
  import('../../features/vault/ShortcutsPage').then((m) => ({
    default: m.ShortcutsPage || (m as any).default,
  })),
);
const SettingsVault = lazy(() =>
  import('../../features/vault/SettingsVault').then((m) => ({
    default: m.SettingsVault || (m as any).default,
  })),
);

// System & Other
const SystemLogsPage = lazy(() =>
  import('../../features/vault/SystemLogsPage').then((m) => ({
    default: m.SystemLogsPage || (m as any).default,
  })),
);
const DeviceSessionsPage = lazy(() =>
  import('../../features/vault/DeviceSessionsPage').then((m) => ({
    default: m.DeviceSessionsPage || (m as any).default,
  })),
);
const VaultEcosystemPage = lazy(() =>
  import('../../features/vault/VaultEcosystemPage').then((m) => ({
    default: m.VaultEcosystemPage || (m as any).default,
  })),
);
const LegalPage = lazy(() =>
  import('../../features/LegalPage').then((m) => ({
    default: m.LegalPage || (m as any).default,
  })),
);
const ContactPage = lazy(() =>
  import('../../features/ContactPage').then((m) => ({
    default: m.ContactPage || (m as any).default,
  })),
);
const NotFoundPage = lazy(() =>
  import('../../features/NotFoundPage').then((m) => ({
    default: m.NotFoundPage || (m as any).default,
  })),
);

type MaintenanceType = 'export' | 'import' | 'changeKey' | 'changePassword';

type MaintenanceState = { isOpen: false } | { isOpen: true; type: MaintenanceType };

const PROFILE_UPDATED_EVENT = 'vault:profile-updated';

const TAB_ORDER: readonly TabId[] = [
  // Main
  'dashboard',

  // Personal Information
  'identities',
  'contacts',
  'passwords',
  'cards',
  'wifi',
  'secrets',

  // Notes & Productivity
  'notes',
  'todos',
  'chats',
  'locations',

  // Media
  'photos',
  'videos',
  'audio',

  // Documents & Files
  'documents',
  'files',

  // App
  'privacy',
  'shortcuts',
  'settings',
];

const TAB_LABELS: Partial<Record<TabId, string>> = {
  ecosystem: 'vault ecosystem',
  systemlogs: 'system logs',
  devicesessions: 'device sessions',
};

const formatTabLabel = (tab: TabId): string => TAB_LABELS[tab] || tab;

const getAdjacentTab = (
  currentTab: TabId,
  direction: 'next' | 'prev',
  sidebarPosition: 'left' | 'right',
): TabId => {
  const currentIndex = TAB_ORDER.indexOf(currentTab);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const step = direction === 'next' ? 1 : -1;
  const directionalStep = sidebarPosition === 'right' ? -step : step;
  const nextIndex = (safeIndex + directionalStep + TAB_ORDER.length) % TAB_ORDER.length;

  return TAB_ORDER[nextIndex];
};

const normalizeProfilePhotoUrl = (value?: string | null): string | null => {
  const normalized = (value || '').trim();
  if (!normalized || normalized.toLowerCase() === 'none') {
    return null;
  }

  // Accept base64-uploaded images directly
  if (normalized.startsWith('data:image/')) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
};

const normalizeDisplayName = (value?: string | null): string => {
  const normalized = (value || '').trim();
  if (!normalized || normalized.toLowerCase() === 'none') {
    return '';
  }
  return normalized;
};

const resolveMonogramLetter = (value?: string | null): string => {
  const normalized = normalizeDisplayName(value);
  if (!normalized) {
    return 'U';
  }

  const firstWord = normalized
    .split(/[\s._-]+/)
    .map((part) => part.trim())
    .filter(Boolean)[0];

  if (!firstWord) {
    return 'U';
  }

  return firstWord.charAt(0).toUpperCase() || 'U';
};

export function AppShell({
  activeTab,
  handleMobileTouchEnd,
  handleMobileTouchMove,
  handleMobileTouchStart,
  isBlurOnTabHideEnabled,
  isInactive,
  isSidebarDragging,
  isSidebarOpen,
  locationPath,
  maintenanceModal,
  mobileOverlayOpacity,
  mobileSidebarTransform,
  navigateToTab,
  onCloseMaintenance,
  onOpenMaintenance,
  resetSidebarGesture,
  safeNavigateToTab,
  setIsInactive,
  setIsSidebarOpen,
  shouldReduceMotion,
  showMobileOverlay,
}: {
  activeTab: TabId;
  handleMobileTouchEnd: () => void;
  handleMobileTouchMove: (event: React.TouchEvent<HTMLDivElement>) => void;
  handleMobileTouchStart: (event: React.TouchEvent<HTMLDivElement>) => void;
  isBlurOnTabHideEnabled: boolean;
  isInactive: boolean;
  isSidebarDragging: boolean;
  isSidebarOpen: boolean;
  locationPath: string;
  maintenanceModal: MaintenanceState;
  mobileOverlayOpacity: number;
  mobileSidebarTransform?: string;
  navigateToTab: (tab: TabId) => void;
  onCloseMaintenance: () => void;
  onOpenMaintenance: (type: MaintenanceType) => void;
  resetSidebarGesture: () => void;
  safeNavigateToTab: (tab: string) => void;
  setIsInactive: (value: boolean) => void;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  shouldReduceMotion: boolean;
  showMobileOverlay: boolean;
}) {
  const sidebarPosition = useVaultStore((state) => state.preferences.sidebarPosition);
  const username = useVaultStore((state) => state.username);
  const panicLock = useVaultStore((state) => state.panicLock);

  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);
  const [showNotifications, setShowNotifications] = React.useState(false);

  // 3× Escape key rapid press -> Instant Panic Lock & Memory Purge
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    let escPressTimestamps: number[] = [];
    const ESC_WINDOW_MS = 1200;
    const REQUIRED_PRESSES = 3;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const now = Date.now();
        escPressTimestamps = escPressTimestamps.filter((t) => now - t <= ESC_WINDOW_MS);
        escPressTimestamps.push(now);

        if (escPressTimestamps.length >= REQUIRED_PRESSES) {
          escPressTimestamps = [];
          panicLock();
        }
      }
    };

    const handlePanicEvent = () => {
      setHeaderProfilePreview(null);
      setShowNotifications(false);
      setIsSidebarOpen(false);
      resetSidebarGesture();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('vault:panic-lock', handlePanicEvent);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('vault:panic-lock', handlePanicEvent);
    };
  }, [panicLock, resetSidebarGesture, setIsSidebarOpen]);

  React.useEffect(() => {
    let isMounted = true;
    let isFetching = false;
    const pollNotifications = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (isFetching) return;
      isFetching = true;
      try {
        await fetchNotifications();
      } finally {
        if (isMounted) isFetching = false;
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void pollNotifications();
      }
    };

    void pollNotifications();
    const interval = setInterval(pollNotifications, 30000);
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [fetchNotifications]);

  const [headerProfileName, setHeaderProfileName] = React.useState('');
  const [headerProfilePhoto, setHeaderProfilePhoto] = React.useState<string | null>(null);
  const [isHeaderProfilePhotoBroken, setIsHeaderProfilePhotoBroken] = React.useState(false);
  const [headerProfilePreview, setHeaderProfilePreview] = React.useState<{
    src: string;
    alt: string;
  } | null>(null);

  const mainRef = React.useRef<HTMLElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const profileLoadRequestIdRef = React.useRef(0);
  const [profileEditorRequestToken, setProfileEditorRequestToken] = React.useState(0);

  const isPopStateRef = React.useRef(false);
  const { restoreScrollPosition } = useScrollRestoration(`route_${locationPath}`, scrollRef, {
    enabled: true,
    autoRestore: false,
  });

  React.useEffect(() => {
    const handlePopState = () => {
      isPopStateRef.current = true;
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  React.useEffect(() => {
    if (scrollRef.current) {
      if (isPopStateRef.current) {
        restoreScrollPosition();
        isPopStateRef.current = false;
      } else {
        scrollRef.current.scrollTo(0, 0);
      }
    }
  }, [locationPath, restoreScrollPosition]);

  React.useEffect(() => {
    const preloadPriorityRoutes = () => {
      void import('../../features/vault/Dashboard');
      void import('../../features/vault/NotesVault');
      void import('../../features/vault/SettingsVault');
      void import('../../features/vault/MediaVault');
      void import('../../features/vault/PasswordManager');
    };

    if (typeof window === 'undefined') return;

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(preloadPriorityRoutes, { timeout: 1000 });
      return () => {
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = globalThis.setTimeout(preloadPriorityRoutes, 400);
    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setIsSidebarOpen((previous) => !previous);
  }, [setIsSidebarOpen]);

  const closeSidebar = React.useCallback(() => {
    setIsSidebarOpen(false);
    resetSidebarGesture();
  }, [resetSidebarGesture, setIsSidebarOpen]);

  const applyHeaderProfile = React.useCallback(
    (profile: { username?: string; profileName?: string; profilePhoto?: string }) => {
      const nextName = normalizeDisplayName(profile.profileName);
      const fallbackName = normalizeDisplayName(profile.username || username);
      setHeaderProfileName(nextName || fallbackName);
      setHeaderProfilePhoto(normalizeProfilePhotoUrl(profile.profilePhoto));
      setIsHeaderProfilePhotoBroken(false);
    },
    [username],
  );

  const loadHeaderProfile = React.useCallback(async () => {
    const requestId = profileLoadRequestIdRef.current + 1;
    profileLoadRequestIdRef.current = requestId;

    try {
      const nextProfile = await getAuthenticatedProfile();
      if (profileLoadRequestIdRef.current !== requestId) {
        return;
      }
      applyHeaderProfile(nextProfile);
    } catch {
      // Keep current header identity when profile endpoint is unavailable.
    }
  }, [applyHeaderProfile]);

  React.useEffect(() => {
    return () => {
      profileLoadRequestIdRef.current += 1;
    };
  }, []);

  React.useEffect(() => {
    setHeaderProfileName((previous) => {
      const normalizedPrevious = normalizeDisplayName(previous);
      if (normalizedPrevious) {
        return normalizedPrevious;
      }
      return normalizeDisplayName(username);
    });
  }, [username]);

  React.useEffect(() => {
    void loadHeaderProfile();
  }, [loadHeaderProfile]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleProfileUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      const detail = event.detail;
      if (!detail || typeof detail !== 'object') {
        return;
      }

      const payload = detail as {
        username?: unknown;
        profileName?: unknown;
        profilePhoto?: unknown;
      };

      applyHeaderProfile({
        username: typeof payload.username === 'string' ? payload.username : undefined,
        profileName: typeof payload.profileName === 'string' ? payload.profileName : undefined,
        profilePhoto: typeof payload.profilePhoto === 'string' ? payload.profilePhoto : undefined,
      });
    };

    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    };
  }, [applyHeaderProfile]);

  const profileMonogram = React.useMemo(() => {
    const defaultName = normalizeDisplayName(username);
    const preferredName = normalizeDisplayName(headerProfileName);
    return resolveMonogramLetter(preferredName || defaultName);
  }, [headerProfileName, username]);

  const activeTabLabel = React.useMemo(() => formatTabLabel(activeTab), [activeTab]);
  const normalizedMobileOverlayOpacity = React.useMemo(
    () => Math.min(1, Math.max(0, mobileOverlayOpacity)),
    [mobileOverlayOpacity],
  );

  const handleOpenProfileEditor = React.useCallback(() => {
    void loadHeaderProfile();
    closeSidebar();
    safeNavigateToTab('settings#edit-profile');
    setProfileEditorRequestToken((previous) => previous + 1);
  }, [closeSidebar, loadHeaderProfile, safeNavigateToTab]);

  const handleHeaderProfileClick = React.useCallback(() => {
    if (headerProfilePhoto && !isHeaderProfilePhotoBroken) {
      setHeaderProfilePreview({
        src: headerProfilePhoto,
        alt: `${headerProfileName || username || 'User'} profile preview`,
      });
      return;
    }

    handleOpenProfileEditor();
  }, [
    handleOpenProfileEditor,
    headerProfileName,
    headerProfilePhoto,
    isHeaderProfilePhotoBroken,
    username,
  ]);

  const handleNextTab = React.useCallback(() => {
    safeNavigateToTab(getAdjacentTab(activeTab, 'next', sidebarPosition));
  }, [activeTab, safeNavigateToTab, sidebarPosition]);

  const handlePrevTab = React.useCallback(() => {
    safeNavigateToTab(getAdjacentTab(activeTab, 'prev', sidebarPosition));
  }, [activeTab, safeNavigateToTab, sidebarPosition]);

  return (
    <>
      <Suspense fallback={null}>
        <CommandPalette />
        {maintenanceModal.isOpen && (
          <MaintenanceModal
            isOpen={maintenanceModal.isOpen}
            onClose={onCloseMaintenance}
            type={maintenanceModal.type}
          />
        )}
      </Suspense>

      <AnimatePresence mode="wait">
        <motion.div
          key="vault"
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          transition={{
            duration: shouldReduceMotion ? 0.2 : 0.6,
            ease: [0.22, 1, 0.36, 1],
          }}
          className={cn(
            'flex h-screen bg-bg text-text selection:bg-text selection:text-bg transition-colors duration-300 overflow-hidden relative',
            sidebarPosition === 'right' && 'flex-row-reverse',
          )}
          onTouchStart={handleMobileTouchStart}
          onTouchMove={handleMobileTouchMove}
          onTouchEnd={handleMobileTouchEnd}
          onTouchCancel={handleMobileTouchEnd}
        >
          {!isSidebarOpen && (
            <div
              className={cn(
                'fixed inset-y-0 z-30 w-8 lg:hidden',
                sidebarPosition === 'right' ? 'right-0' : 'left-0',
              )}
              onTouchStart={handleMobileTouchStart}
              onTouchMove={handleMobileTouchMove}
              onTouchEnd={handleMobileTouchEnd}
              onTouchCancel={handleMobileTouchEnd}
              style={{ touchAction: 'pan-y' }}
              aria-hidden="true"
            />
          )}

          {showMobileOverlay && (
            <div
              onClick={closeSidebar}
              className={cn(
                'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden',
                !isSidebarOpen && !isSidebarDragging && 'pointer-events-none',
              )}
              style={{ opacity: normalizedMobileOverlayOpacity }}
            />
          )}

          <Sidebar
            activeTab={activeTab}
            setActiveTab={safeNavigateToTab}
            onClose={isSidebarOpen ? closeSidebar : undefined}
            onExpand={() => setIsSidebarOpen(true)}
            compact={!isSidebarOpen}
            className={cn(
              'fixed inset-y-0 z-50 transform ease-in-out lg:relative lg:inset-auto lg:z-10 lg:h-full lg:overflow-hidden lg:transition-[width] lg:duration-300',
              sidebarPosition === 'right' ? 'right-0' : 'left-0',
              isSidebarDragging ? 'transition-none' : 'transition-transform duration-300',
              isSidebarOpen
                ? 'translate-x-0 lg:w-64'
                : sidebarPosition === 'right'
                  ? 'translate-x-full lg:translate-x-0 lg:w-20'
                  : '-translate-x-full lg:translate-x-0 lg:w-20',
            )}
            style={mobileSidebarTransform ? { transform: mobileSidebarTransform } : undefined}
          />

          <div className="flex flex-1 flex-col overflow-hidden">
            <VaultIntegrityAlarmBanner />
            <AppHeader
              showNotifications={showNotifications}
              setShowNotifications={setShowNotifications}
              sidebarPosition={sidebarPosition}
              isSidebarOpen={isSidebarOpen}
              toggleSidebar={toggleSidebar}
              activeTabLabel={activeTabLabel}
              handlePrevTab={handlePrevTab}
              handleNextTab={handleNextTab}
              unreadCount={unreadCount}
              handleHeaderProfileClick={handleHeaderProfileClick}
              headerProfilePhoto={headerProfilePhoto}
              isHeaderProfilePhotoBroken={isHeaderProfilePhotoBroken}
              setIsHeaderProfilePhotoBroken={setIsHeaderProfilePhotoBroken}
              headerProfileName={headerProfileName}
              username={username}
              profileMonogram={profileMonogram}
            />

            <main
              ref={mainRef}
              className={`relative flex-1 overflow-hidden transition-all duration-500 ${
                isInactive ? 'blur-2xl scale-95 pointer-events-none' : ''
              }`}
            >
              <AnimatePresence mode="wait">
                <ErrorBoundary
                  fallback={
                    <ErrorFallback
                      label={`The ${activeTabLabel} section failed to load. Please refresh and try again.`}
                    />
                  }
                >
                  <Suspense
                    fallback={
                      <div className="flex h-full min-h-[calc(100vh-10rem)] items-center justify-center">
                        <LoadingScreen fullscreen={false} label={`Loading ${activeTabLabel}...`} />
                      </div>
                    }
                  >
                    <motion.div
                      key={locationPath}
                      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                      transition={{ duration: shouldReduceMotion ? 0.1 : 0.2 }}
                      ref={scrollRef}
                      className={cn(
                        'mx-auto w-full h-full',
                        // Pages that handle their own complex layouts with internal scrolling
                        activeTab === 'notes' || activeTab === 'locations' || activeTab === 'chats'
                          ? 'overflow-hidden'
                          : cn(
                              maintenanceModal.isOpen ? 'overflow-hidden' : 'overflow-y-auto',
                              'p-4 lg:p-4 xl:p-8 custom-scrollbar touch-pan-y',
                            ),
                        'max-w-[120rem]',
                      )}
                    >
                      <Routes>
                        {/* Main */}
                        <Route path="/" element={<Dashboard onNavigate={safeNavigateToTab} />} />

                        {/* Personal Information */}
                        <Route path="/identities" element={<IdentitiesVault />} />
                        <Route path="/contacts" element={<ContactsVault />} />
                        <Route path="/passwords" element={<PasswordManager />} />
                        <Route path="/cards" element={<CardsVault />} />
                        <Route path="/wifi" element={<WifiVault />} />
                        <Route path="/secrets" element={<SecretsVault />} />

                        {/* Notes & Productivity */}
                        <Route path="/notes" element={<NotesVault />} />
                        <Route path="/todos" element={<TodoVault />} />
                        <Route path="/chats" element={<ChatVault />} />
                        <Route path="/locations" element={<LocationVault />} />

                        {/* Media */}
                        <Route path="/photos" element={<MediaVault type="photo" />} />
                        <Route path="/videos" element={<MediaVault type="video" />} />
                        <Route path="/audio" element={<AudioVault />} />

                        {/* Documents & Files */}
                        <Route path="/documents" element={<DocumentsVault />} />
                        <Route path="/files" element={<OtherFilesVault />} />

                        {/* App */}
                        <Route
                          path="/privacy"
                          element={
                            <PrivacyInterfacePage onBack={() => navigateToTab('settings')} />
                          }
                        />
                        <Route path="/shortcuts" element={<ShortcutsPage />} />
                        <Route
                          path="/settings"
                          element={
                            <SettingsVault
                              onOpenMaintenance={onOpenMaintenance}
                              onNavigate={safeNavigateToTab}
                              openProfileEditorRequestToken={profileEditorRequestToken}
                            />
                          }
                        />

                        {/* System & Other */}
                        <Route
                          path="/system-logs"
                          element={<SystemLogsPage onBack={() => navigateToTab('settings')} />}
                        />
                        <Route
                          path="/device-sessions"
                          element={<DeviceSessionsPage onBack={() => navigateToTab('settings')} />}
                        />
                        <Route
                          path="/eco"
                          element={<VaultEcosystemPage onBack={() => navigateToTab('settings')} />}
                        />
                        <Route path="/legal" element={<LegalPage />} />
                        <Route
                          path="/contact"
                          element={<ContactPage onNavigate={safeNavigateToTab} />}
                        />
                        <Route path="*" element={<NotFoundPage />} />
                      </Routes>
                    </motion.div>
                  </Suspense>
                </ErrorBoundary>
              </AnimatePresence>
            </main>
          </div>

          {isInactive && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-bg/20 backdrop-blur-sm cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label="Reveal vault content"
              onClick={() => setIsInactive(false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setIsInactive(false);
                }
              }}
            >
              <motion.div
                initial={shouldReduceMotion ? { opacity: 0 } : { scale: 0.9, opacity: 0 }}
                animate={shouldReduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-4 rounded-3xl bg-bg/60 p-10 border border-card-border shadow-2xl backdrop-blur-md transition-colors duration-300"
              >
                <Lock className="h-16 w-16 text-text transition-colors mb-2" />
                <p className="text-2xl font-bold text-text transition-colors">Vault is Hidden</p>
                <p className="text-sm text-text/50 transition-colors">
                  {isBlurOnTabHideEnabled
                    ? 'Move mouse or click to reveal'
                    : 'Move mouse to reveal'}
                </p>
              </motion.div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {headerProfilePreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm vault-print-protected"
          onClick={() => setHeaderProfilePreview(null)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close image preview"
              onClick={() => setHeaderProfilePreview(null)}
              className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={headerProfilePreview.src}
              alt={headerProfilePreview.alt}
              loading="eager"
              decoding="async"
              className="max-h-[85vh] w-full rounded-2xl object-contain vault-print-protected"
            />
          </div>
        </div>
      )}

      <VaultIntegrityAlarmModal />
    </>
  );
}
