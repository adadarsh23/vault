import React from 'react';
import {
  Lock,
  ChevronRight,
  ChevronLeft,
  Search,
  Bell,
  PanelLeft,
  Eye,
  EyeOff,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { NotificationDropdown } from './NotificationDropdown';
import { useVaultStore } from '../../store/vaultStore';
// import { CloudHealthIndicator } from '../vault/CloudHealthIndicator';

interface AppHeaderProps {
  showNotifications: boolean;
  setShowNotifications: (show: boolean) => void;
  sidebarPosition?: 'left' | 'right';
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  activeTabLabel: string;
  handlePrevTab: () => void;
  handleNextTab: () => void;
  unreadCount: number;
  handleHeaderProfileClick: () => void;
  headerProfilePhoto: string | null;
  isHeaderProfilePhotoBroken: boolean;
  setIsHeaderProfilePhotoBroken: (broken: boolean) => void;
  headerProfileName: string;
  username: string | null;
  profileMonogram: string;
  connectionStatus?: 'connected' | 'error' | 'loading';
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  showNotifications,
  setShowNotifications,
  sidebarPosition = 'left',
  isSidebarOpen,
  toggleSidebar,
  activeTabLabel,
  handlePrevTab,
  handleNextTab,
  unreadCount,
  handleHeaderProfileClick,
  headerProfilePhoto,
  isHeaderProfilePhotoBroken,
  setIsHeaderProfilePhotoBroken,
  headerProfileName,
  username,
  profileMonogram,
  connectionStatus: connectionStatusProp,
}) => {
  const isDiscreetMode = useVaultStore((state) => state.isDiscreetMode);
  const toggleDiscreetMode = useVaultStore((state) => state.toggleDiscreetMode);
  const panicLock = useVaultStore((state) => state.panicLock);

  const [connectionStatus, setConnectionStatus] = React.useState<'connected' | 'error' | 'loading'>(
    () => {
      if (connectionStatusProp) return connectionStatusProp;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return 'error';
      }
      return 'connected';
    }
  );

  React.useEffect(() => {
    if (connectionStatusProp) {
      setConnectionStatus(connectionStatusProp);
      return;
    }

    const handleSyncStatus = (event: Event) => {
      const customEvent = event as CustomEvent<{
        status: 'connected' | 'error' | 'loading';
      }>;
      if (customEvent.detail?.status) {
        setConnectionStatus(customEvent.detail.status);
      }
    };

    const handleOnline = () => setConnectionStatus('connected');
    const handleOffline = () => setConnectionStatus('error');

    window.addEventListener('vault-cloud-health-status', handleSyncStatus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('vault-cloud-health-status', handleSyncStatus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [connectionStatusProp]);

  return (
    <header
      role="banner"
      className={cn(
        'relative flex h-14 sm:h-16 w-full items-center justify-between border-b border-sidebar-border bg-sidebar-bg/60 px-2 sm:px-4 lg:px-6 backdrop-blur-xl transition-all duration-200 select-none',
        showNotifications ? 'z-[100]' : 'z-40',
        sidebarPosition === 'right' && 'flex-row-reverse'
      )}
    >
      {/* Mobile Branding, Active Heading & Sidebar Toggle */}
      <div
        className={cn(
          'flex items-center gap-1.5 sm:gap-2.5 lg:hidden min-w-0 max-w-[48vw] sm:max-w-[55vw]',
          sidebarPosition === 'right' && 'flex-row-reverse'
        )}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex items-center gap-1.5 sm:gap-2 rounded-lg text-text transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25 min-w-0"
          aria-label={isSidebarOpen ? 'Close sidebar navigation' : 'Open sidebar navigation'}
          aria-controls="primary-sidebar"
          aria-expanded={isSidebarOpen}
        >
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-text text-bg shrink-0 border border-transparent shadow-sm transition hover:shadow-md">
            <Lock className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-bg" />
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-sm font-bold tracking-tight text-text leading-tight hidden xs:inline shrink-0">
              Vault
            </span>
            <span className="text-xs text-text/30 hidden xs:inline shrink-0 font-medium">/</span>
            <h1 className="text-xs sm:text-sm font-semibold capitalize text-text tracking-wide truncate">
              {activeTabLabel}
            </h1>
          </div>
        </button>
      </div>

      {/* Desktop / Laptop Left Section */}
      <div
        className={cn(
          'hidden lg:flex items-center gap-3 min-w-0',
          sidebarPosition === 'right' && 'flex-row-reverse'
        )}
      >
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-text/15 bg-text/5 text-text/70 transition-all hover:bg-text/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25 active:scale-95"
          onClick={toggleSidebar}
          aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <PanelLeft
            className={cn(
              'h-5 w-5 text-text/80 transition-transform duration-200 hover:text-text',
              sidebarPosition === 'right' && 'rotate-180'
            )}
          />
        </button>
        <h1 className="text-base sm:text-lg font-semibold capitalize text-text tracking-wide truncate">
          {activeTabLabel}
        </h1>
      </div>

      {/* Header Right Actions & Mobile Tab Navigator */}
      <div
        className={cn(
          'flex items-center gap-1 sm:gap-1.5 md:gap-2 lg:gap-3 ml-auto min-w-0 shrink-0',
          sidebarPosition === 'right' && 'flex-row-reverse mr-auto ml-0'
        )}
      >
        {/* Tablet Quick Tab Switcher Pill (shown on medium screens, hidden on phones) */}
        <div
          className={cn(
            'hidden md:flex lg:hidden items-center gap-0.5 text-xs font-medium text-text/60 max-w-[140px] truncate',
            sidebarPosition === 'right' && 'flex-row-reverse'
          )}
        >
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-text/15 bg-text/5 text-text/70 transition-all hover:bg-text/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25 active:scale-95"
            onClick={handlePrevTab}
            aria-label="Go to previous tab"
            title="Previous tab"
          >
            <ChevronLeft
              className={cn('h-3.5 w-3.5', sidebarPosition === 'right' && 'rotate-180')}
            />
          </button>

          <button
            type="button"
            className="px-1.5 py-1 text-[11px] sm:text-xs font-medium capitalize truncate max-w-[90px] text-center text-text transition-colors focus-visible:outline-none"
            onClick={toggleSidebar}
            aria-label="Toggle navigation sidebar"
            title="Switch section"
          >
            {activeTabLabel}
          </button>

          <button
            type="button"
            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-text/15 bg-text/5 text-text/70 transition-all hover:bg-text/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25 active:scale-95"
            onClick={handleNextTab}
            aria-label="Go to next tab"
            title="Next tab"
          >
            <ChevronRight
              className={cn('h-3.5 w-3.5', sidebarPosition === 'right' && 'rotate-180')}
            />
          </button>
        </div>

        {/* Mobile Cloud Health Indicator */}
        {/*<CloudHealthIndicator compact={true} className="flex lg:hidden shrink-0" /> */}

        {/* Search Command Palette Trigger */}
        <button
          type="button"
          className="relative flex h-8 w-8 sm:h-9 sm:w-auto shrink-0 items-center justify-center gap-2 rounded-full border border-text/15 bg-text/5 sm:px-3 text-text transition-all duration-200 hover:bg-text/10 hover:border-text/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25 active:scale-95"
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          aria-label="Open search command palette"
          title="Search (Ctrl+K / Cmd+K)"
        >
          <Search className="h-4 w-4 text-text/80 transition-colors" />
          <span className="hidden sm:inline text-xs text-text/50 font-medium">Search...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-text/15 bg-text/10 px-1.5 py-0.5 text-[10px] font-mono text-text/60">
            ⌘K
          </kbd>
        </button>

        {/* Discreet / Privacy Blur Mode Toggle */}
        <button
          type="button"
          className={cn(
            'relative flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 active:scale-95',
            isDiscreetMode
              ? 'border-amber-400/50 bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.35)] hover:bg-amber-500/30 focus-visible:ring-amber-400/40'
              : 'border-text/15 bg-text/5 text-text/80 hover:bg-text/10 hover:border-text/30 hover:text-text focus-visible:ring-text/25'
          )}
          onClick={toggleDiscreetMode}
          aria-label={
            isDiscreetMode
              ? 'Discreet Mode active. Click to disable privacy blur.'
              : 'Enable Discreet Mode (Anti-shoulder surfing privacy blur)'
          }
          aria-pressed={isDiscreetMode}
          title={
            isDiscreetMode
              ? 'Discreet Mode: Active (Media is blurred). Click to disable.'
              : 'Discreet Mode (Anti-Shoulder Surfing): Blur photos & videos'
          }
        >
          {isDiscreetMode ? (
            <EyeOff className="h-4 w-4 text-amber-300 animate-pulse" />
          ) : (
            <Eye className="h-4 w-4 text-text/80 transition-colors" />
          )}
        </button>

        {/* Instant Panic Lock Padlock Button */}
        <button
          type="button"
          className="relative flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full border border-text/15 bg-text/5 text-text/80 transition-all duration-200 hover:border-red-500/50 hover:bg-red-500/15 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 active:scale-95 group"
          onClick={panicLock}
          aria-label="Instant Panic Lock (Clears memory and locks vault, or press Esc 3 times)"
          title="Instant Panic Lock (Press Esc 3× or click)"
        >
          <ShieldAlert className="h-4 w-4 transition-transform group-hover:scale-110" />
        </button>

        {/* Notification Bell */}
        <div className={cn('relative', showNotifications && 'z-[100]')}>
          <button
            type="button"
            className="relative flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full border border-text/15 bg-text/5 text-text transition-all duration-200 hover:bg-text/10 hover:border-text/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25 active:scale-95"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
            title="Notifications"
          >
            <Bell className="h-4 w-4 text-text/80 transition-colors" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 sm:h-4 sm:w-4 items-center justify-center rounded-full bg-emerald-500 text-[8px] sm:text-[9px] font-bold text-black ring-2 ring-sidebar-bg animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <NotificationDropdown
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
          />
        </div>

        {/* Header Profile Photo / Monogram Button with Connection Status Indicator */}
        <div className="relative shrink-0 flex items-center justify-center">
          <button
            type="button"
            className="relative flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full border border-text/15 bg-text/5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-text transition-all duration-200 hover:bg-text/10 hover:border-text/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25 active:scale-95 overflow-hidden"
            onClick={handleHeaderProfileClick}
            aria-label={
              headerProfilePhoto && !isHeaderProfilePhotoBroken
                ? 'Open profile image preview'
                : 'Open profile editor'
            }
            title={
              headerProfilePhoto && !isHeaderProfilePhotoBroken
                ? `${headerProfileName || username || 'Profile'} - Preview image`
                : `${headerProfileName || username || 'Profile'} - Edit profile`
            }
          >
            {headerProfilePhoto && !isHeaderProfilePhotoBroken ? (
              <img
                src={headerProfilePhoto}
                alt={`${headerProfileName || username || 'User'} profile`}
                className="h-full w-full rounded-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setIsHeaderProfilePhotoBroken(true)}
              />
            ) : (
              profileMonogram
            )}
          </button>
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full border-2 border-sidebar-bg transition-all duration-300 pointer-events-none z-10',
              connectionStatus === 'connected' &&
                'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
              connectionStatus === 'error' && 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]',
              connectionStatus === 'loading' && 'bg-amber-500 animate-pulse'
            )}
            title={
              connectionStatus === 'connected'
                ? 'Cloud Connected'
                : connectionStatus === 'error'
                  ? 'Connection Lost'
                  : 'Connecting...'
            }
            aria-label={`Connection status: ${connectionStatus}`}
          />
        </div>
      </div>
    </header>
  );
};
