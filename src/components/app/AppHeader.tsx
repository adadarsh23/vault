import React from 'react';
import { Lock, ChevronRight, ChevronLeft, Search, Bell, PanelLeft } from 'lucide-react';
import { cn } from '../../lib/utils';
import { NotificationDropdown } from './NotificationDropdown';

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
}) => {
  return (
    <header
      role="banner"
      className={cn(
        'relative flex h-16 w-full items-center justify-between border-b border-sidebar-border bg-sidebar-bg/60 px-3 sm:px-4 lg:px-6 backdrop-blur-xl transition-all duration-200 select-none',
        showNotifications ? 'z-[100]' : 'z-40',
        sidebarPosition === 'right' && 'flex-row-reverse'
      )}
    >
      {/* Mobile Branding & Sidebar Toggle */}
      <div
        className={cn(
          'flex items-center gap-2 sm:gap-3 lg:hidden',
          sidebarPosition === 'right' && 'flex-row-reverse'
        )}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex items-center gap-2.5 rounded-lg text-text transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25"
          aria-label={isSidebarOpen ? 'Close sidebar navigation' : 'Open sidebar navigation'}
          aria-controls="primary-sidebar"
          aria-expanded={isSidebarOpen}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-text text-bg shrink-0 border border-transparent shadow-sm transition hover:shadow-md">
            <Lock className="h-5 w-5 shrink-0 text-bg" />
          </div>
          <span className="text-base sm:text-lg font-bold tracking-tight text-text leading-tight">
            Vault
          </span>
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
          'flex items-center gap-1.5 sm:gap-2 lg:gap-3 ml-auto min-w-0',
          sidebarPosition === 'right' && 'flex-row-reverse mr-auto ml-0'
        )}
      >
        {/* Mobile Quick Tab Switcher Pill */}
        <div
          className={cn(
            'flex items-center gap-0.1 text-xs font-medium text-text/60 lg:hidden max-w-[150px] sm:max-w-none truncate',
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
            className="px-2 py-1 text-[11px] sm:text-xs font-medium capitalize truncate max-w-[80px] sm:max-w-[120px] text-center text-text transition-colors focus-visible:outline-none"
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

        {/* Search Command Palette Trigger */}
        <button
          type="button"
          className="relative flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-text/15 bg-text/5 px-2.5 sm:px-3 text-text transition-all duration-200 hover:bg-text/10 hover:border-text/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25 active:scale-95"
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

        {/* Notification Bell */}
        <div className={cn('relative', showNotifications && 'z-[100]')}>
          <button
            type="button"
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-text/15 bg-text/5 text-text transition-all duration-200 hover:bg-text/10 hover:border-text/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25 active:scale-95"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
            title="Notifications"
          >
            <Bell className="h-4 w-4 text-text/80 transition-colors" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-black ring-2 ring-sidebar-bg animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <NotificationDropdown
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
          />
        </div>

        {/* Header Profile Photo / Monogram Button */}
        <button
          type="button"
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-text/15 bg-text/5 text-[11px] font-semibold uppercase tracking-wide text-text transition-all duration-200 hover:bg-text/10 hover:border-text/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25 active:scale-95 overflow-hidden"
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
      </div>
    </header>
  );
};
