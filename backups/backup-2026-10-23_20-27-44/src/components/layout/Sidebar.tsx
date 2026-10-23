import React, { memo, useCallback } from 'react';
import {
  LayoutDashboard,
  Image,
  Video,
  AudioLines,
  Key,
  ShieldCheck,
  Shield,
  FilePlus,
  FileText,
  Settings,
  LogOut,
  Lock,
  Box,
  Sun,
  Moon,
  Monitor,
  Users,
  MapPin,
  ListTodo,
  MessageSquareText,
  CreditCard,
  Fingerprint,
  Wifi,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useVaultStore } from '../../store/vaultStore';
import { useThemeStore, Theme } from '../../store/themeStore';
import { useMediaQuery } from '../../hooks/use-media-query';
import { motion } from 'framer-motion';
import { CloudHealthIndicator } from '../vault/CloudHealthIndicator';
import { ErrorBoundary } from '../ui/ErrorBoundary';

export interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onClose?: () => void;
  onExpand?: () => void;
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean;
}

export interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  group: 'core' | 'vaults' | 'system';
}

/* Static menu items definition outside component to prevent re-allocations */
const MENU_ITEMS: MenuItem[] = [
  // Core
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'core' },

  // Vault Collections
  { id: 'identities', label: 'Identities', icon: Fingerprint, group: 'vaults' },
  { id: 'contacts', label: 'Contacts', icon: Users, group: 'vaults' },
  { id: 'passwords', label: 'Passwords', icon: Key, group: 'vaults' },
  { id: 'cards', label: 'Cards & Bank', icon: CreditCard, group: 'vaults' },
  { id: 'wifi', label: 'Wi-Fi', icon: Wifi, group: 'vaults' },
  { id: 'secrets', label: 'Secrets', icon: ShieldCheck, group: 'vaults' },
  { id: 'notes', label: 'Notes', icon: FileText, group: 'vaults' },
  { id: 'todos', label: 'Todos', icon: ListTodo, group: 'vaults' },
  { id: 'chats', label: 'Chats', icon: MessageSquareText, group: 'vaults' },
  { id: 'locations', label: 'Locations', icon: MapPin, group: 'vaults' },
  { id: 'photos', label: 'Photos', icon: Image, group: 'vaults' },
  { id: 'videos', label: 'Videos', icon: Video, group: 'vaults' },
  { id: 'audio', label: 'Audio', icon: AudioLines, group: 'vaults' },
  { id: 'documents', label: 'Documents', icon: FilePlus, group: 'vaults' },
  { id: 'files', label: 'Other Files', icon: Box, group: 'vaults' },

  // System
  { id: 'privacy', label: 'Privacy', icon: Shield, group: 'system' },
  { id: 'shortcuts', label: 'Shortcuts', icon: ListTodo, group: 'system' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'system' },
];

const GROUPED_MENU = [
  {
    id: 'core',
    label: 'Overview',
    items: MENU_ITEMS.filter((item) => item.group === 'core'),
  },
  {
    id: 'vaults',
    label: 'Collections',
    items: MENU_ITEMS.filter((item) => item.group === 'vaults'),
  },
  {
    id: 'system',
    label: 'System',
    items: MENU_ITEMS.filter((item) => item.group === 'system'),
  },
];

const THEMES: { id: Theme; icon: React.ElementType; label: string }[] = [
  { id: 'light', icon: Sun, label: 'Light' },
  { id: 'dark', icon: Moon, label: 'Dark' },
  { id: 'system', icon: Monitor, label: 'System' },
];

export const Sidebar: React.FC<SidebarProps> = memo(
  ({ activeTab, setActiveTab, onClose, onExpand, className, style, compact = false }) => {
    const fullLogout = useVaultStore((state) => state.fullLogout);
    const sidebarPosition = useVaultStore((state) => state.preferences?.sidebarPosition ?? 'left');
    const isUnlocked = useVaultStore((state) => state.isUnlocked);
    const isVaultReady = useVaultStore((state) => state.isVaultReady);
    const isLoading = useVaultStore((state) => state.isLoading);

    const { theme, setTheme } = useThemeStore();
    const isMobile = useMediaQuery('(max-width: 1023px)');

    const handleThemeChange = useCallback(
      (
        newTheme: Theme,
        e?:
          | React.MouseEvent<HTMLButtonElement>
          | React.TouchEvent<HTMLButtonElement>
          | React.KeyboardEvent,
      ) => {
        if (typeof window !== 'undefined' && e && 'currentTarget' in e && e.currentTarget) {
          try {
            const target = e.currentTarget as HTMLElement;
            const rect = target.getBoundingClientRect();
            let clientX: number | undefined;
            let clientY: number | undefined;

            if ('touches' in e && e.touches && e.touches.length > 0) {
              clientX = e.touches[0].clientX;
              clientY = e.touches[0].clientY;
            } else if ('changedTouches' in e && e.changedTouches && e.changedTouches.length > 0) {
              clientX = e.changedTouches[0].clientX;
              clientY = e.changedTouches[0].clientY;
            } else if ('clientX' in e && typeof e.clientX === 'number') {
              clientX = e.clientX;
              clientY = e.clientY;
            }

            const x =
              typeof clientX === 'number' && clientX > 0
                ? Math.round(clientX)
                : Math.round(rect.left + rect.width / 2);
            const y =
              typeof clientY === 'number' && clientY > 0
                ? Math.round(clientY)
                : Math.round(rect.top + rect.height / 2);

            window.__recordThemeToggleOrigin?.(x, y);
          } catch {
            // Graceful fallback for geometry lookup
          }
        }

        // Micro-haptic feedback on mobile if supported
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(8);
          } catch {}
        }

        setTheme(newTheme);
      },
      [setTheme],
    );

    // Keyboard navigation for theme radiogroup
    const handleThemeKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
        let targetIndex: number | null = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          targetIndex = (currentIndex + 1) % THEMES.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          targetIndex = (currentIndex - 1 + THEMES.length) % THEMES.length;
        }

        if (targetIndex !== null) {
          handleThemeChange(THEMES[targetIndex].id, e);
        }
      },
      [handleThemeChange],
    );

    const handleTabClick = useCallback(
      (tab: string) => {
        setActiveTab(tab);
        if (isMobile && !compact) {
          onClose?.();
        }
      },
      [compact, isMobile, onClose, setActiveTab],
    );

    const handleFullLogout = useCallback(async () => {
      try {
        await fullLogout();
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Logout error:', err);
        }
      } finally {
        if (isMobile) {
          onClose?.();
        }
      }
    }, [fullLogout, isMobile, onClose]);

    const handleLockToggle = useCallback(() => {
      if (compact) {
        onExpand?.();
        return;
      }
      onClose?.();
    }, [compact, onClose, onExpand]);

    return (
      <aside
        id="primary-sidebar"
        role="navigation"
        aria-label="Primary Vault Sidebar"
        className={cn(
          'touch-pan-y overscroll-contain flex h-screen h-[100dvh] w-[17.5rem] max-w-[85vw] flex-col bg-sidebar-bg backdrop-blur-xl transition-all duration-300 lg:w-64 print:hidden select-none',
          compact && 'lg:w-20',
          sidebarPosition === 'right'
            ? 'border-l border-sidebar-border shadow-[-4px_0_24px_rgba(0,0,0,0.05)]'
            : 'border-r border-sidebar-border shadow-[4px_0_24px_rgba(0,0,0,0.05)]',
          className,
        )}
        style={style}
      >
        {/* Header with Safe Area Inset */}
        <div
          className={cn(
            'flex items-center justify-between p-5 sm:p-6 pt-[max(1.25rem,env(safe-area-inset-top,0px))]',
            compact && 'justify-center px-2 py-4 pt-[max(1rem,env(safe-area-inset-top,0px))]',
          )}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleLockToggle}
              className={cn(
                'flex items-center justify-center bg-text text-bg shrink-0 border border-transparent shadow-sm transition hover:opacity-90 hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/30',
                compact ? 'h-12 w-12 rounded-lg' : 'h-10 w-10 rounded-lg',
              )}
              aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-controls="primary-sidebar"
              aria-expanded={!compact}
            >
              <Lock
                className={cn('shrink-0', compact ? 'h-6 w-6' : 'h-5 w-5')}
                aria-hidden="true"
              />
            </button>
            <div className={cn('flex flex-col', compact && 'hidden')}>
              <span className="text-lg font-bold tracking-tight text-text leading-tight">
                Vault
              </span>
              {isLoading && isUnlocked && (
                <span className="mt-1 inline-flex w-fit rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-500/80">
                  Loading
                </span>
              )}
              {!isLoading && isUnlocked && isVaultReady && (
                <span className="mt-1 inline-flex w-fit rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500/80">
                  Protected
                </span>
              )}
              {!isUnlocked && (
                <span className="mt-1 inline-flex w-fit rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-500/80">
                  Locked
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <nav
          className={cn(
            'custom-scrollbar flex-1 space-y-1.5 overflow-y-auto px-3 py-4',
            compact && 'px-2',
          )}
        >
          {GROUPED_MENU.map((section) => (
            <div key={section.id} className="space-y-1.5">
              {!compact && (
                <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text/35">
                  {section.label}
                </p>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <motion.button
                    key={item.id}
                    whileHover={compact ? undefined : { x: sidebarPosition === 'right' ? -4 : 4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleTabClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    title={item.label}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20 cursor-pointer',
                      compact && 'h-11 justify-center rounded-lg px-0',
                      isActive
                        ? 'bg-text text-bg shadow-sm'
                        : 'text-text/50 hover:border-text/10 hover:bg-text/5 hover:text-text',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-5 w-5 shrink-0',
                        isActive ? 'text-bg' : 'text-text/40 group-hover:text-text',
                      )}
                      aria-hidden="true"
                    />
                    {!compact && <span className="truncate">{item.label}</span>}
                  </motion.button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer Controls with Bottom Safe Area Inset */}
        <div
          className={cn(
            'space-y-3 border-t border-sidebar-border p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]',
            compact && 'px-2',
          )}
        >
          {/* Theme Switch */}
          <div
            role="radiogroup"
            aria-label="Color theme selector"
            className={cn(
              'relative flex items-center gap-1 rounded-xl bg-text/5 p-1.5',
              compact && 'flex-col rounded-lg',
            )}
          >
            {THEMES.map((t, idx) => {
              const Icon = t.icon;
              const isActive = theme === t.id;

              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  tabIndex={isActive ? 0 : -1}
                  aria-checked={isActive}
                  onClick={(e) => handleThemeChange(t.id, e)}
                  onKeyDown={(e) => handleThemeKeyDown(e, idx)}
                  className={cn(
                    'relative flex flex-1 items-center justify-center rounded-lg py-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20 cursor-pointer select-none',
                    compact && 'w-full',
                    isActive
                      ? 'text-bg font-medium'
                      : 'text-text/40 hover:text-text hover:bg-text/5',
                  )}
                  aria-label={`${t.label} theme`}
                  title={`${t.label} theme`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-theme-pill"
                      className="absolute inset-0 rounded-lg bg-text shadow-sm"
                      transition={{
                        type: 'spring',
                        stiffness: 450,
                        damping: 32,
                      }}
                    />
                  )}
                  <motion.div
                    className="relative z-10 flex items-center justify-center"
                    animate={
                      isActive
                        ? { scale: 1, rotate: t.id === 'light' ? 90 : t.id === 'dark' ? -15 : 0 }
                        : { scale: 0.88, rotate: 0 }
                    }
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.85 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 24 }}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </motion.div>
                </button>
              );
            })}
          </div>

          {/* Cloud Health Indicator with Error Boundary */}
          <ErrorBoundary fallback={null}>
            <CloudHealthIndicator compact={compact} />
          </ErrorBoundary>

          {/* Sign Out Button */}
          <div className="flex flex-col gap-2">
            <motion.button
              whileHover={{
                x: compact || isMobile ? 0 : sidebarPosition === 'right' ? -4 : 4,
              }}
              whileTap={{ scale: 0.96 }}
              onClick={handleFullLogout}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-500/10 hover:text-red-600 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30',
                compact && 'justify-center px-0',
              )}
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
              {!compact && <span>Sign Out</span>}
            </motion.button>
          </div>
        </div>
      </aside>
    );
  },
);

Sidebar.displayName = 'Sidebar';
export default Sidebar;
