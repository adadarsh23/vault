import React, { useCallback, useMemo } from 'react';
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
// Removed activity logging for lock functionality
import { motion } from 'framer-motion';
import { CloudHealthIndicator } from '../vault/CloudHealthIndicator';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onClose?: () => void;
  onExpand?: () => void;
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  group: 'core' | 'vaults' | 'system';
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onClose,
  onExpand,
  className,
  style,
  compact = false,
}) => {
  const fullLogout = useVaultStore((state) => state.fullLogout);
  const sidebarPosition = useVaultStore((state) => state.preferences.sidebarPosition);
  const { theme, setTheme } = useThemeStore();
  const isMobile = useMediaQuery('(max-width: 1023px)');

  const menuItems: MenuItem[] = useMemo(
    () => [
      // Main
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        group: 'core',
      },

      // Personal Information
      { id: 'identities', label: 'Identities', icon: Fingerprint, group: 'vaults' },
      { id: 'contacts', label: 'Contacts', icon: Users, group: 'vaults' },
      { id: 'passwords', label: 'Passwords', icon: Key, group: 'vaults' },
      { id: 'cards', label: 'Cards & Bank', icon: CreditCard, group: 'vaults' },
      { id: 'wifi', label: 'Wi-Fi', icon: Wifi, group: 'vaults' },
      { id: 'secrets', label: 'Secrets', icon: ShieldCheck, group: 'vaults' },

      // Notes & Productivity
      { id: 'notes', label: 'Notes', icon: FileText, group: 'vaults' },
      { id: 'todos', label: 'Todos', icon: ListTodo, group: 'vaults' },
      {
        id: 'chats',
        label: 'Chats',
        icon: MessageSquareText,
        group: 'vaults',
      },
      { id: 'locations', label: 'Locations', icon: MapPin, group: 'vaults' },

      // Media
      { id: 'photos', label: 'Photos', icon: Image, group: 'vaults' },
      { id: 'videos', label: 'Videos', icon: Video, group: 'vaults' },
      { id: 'audio', label: 'Audio', icon: AudioLines, group: 'vaults' },

      // Documents & Files
      { id: 'documents', label: 'Documents', icon: FilePlus, group: 'vaults' },
      { id: 'files', label: 'Other Files', icon: Box, group: 'vaults' },

      // App
      { id: 'privacy', label: 'Privacy', icon: Shield, group: 'system' },
      { id: 'shortcuts', label: 'Shortcuts', icon: ListTodo, group: 'system' },
      { id: 'settings', label: 'Settings', icon: Settings, group: 'system' },
    ],
    []
  );
  const groupedMenu = useMemo(
    () => [
      {
        id: 'core',
        label: 'Overview',
        items: menuItems.filter((item) => item.group === 'core'),
      },
      {
        id: 'vaults',
        label: 'Collections',
        items: menuItems.filter((item) => item.group === 'vaults'),
      },
      {
        id: 'system',
        label: 'System',
        items: menuItems.filter((item) => item.group === 'system'),
      },
    ],
    [menuItems]
  );

  const themes = useMemo(
    () => [
      { id: 'light' as Theme, icon: Sun, label: 'Light' },
      { id: 'dark' as Theme, icon: Moon, label: 'Dark' },
      { id: 'system' as Theme, icon: Monitor, label: 'System' },
    ],
    []
  );

  const handleThemeChange = useCallback(
    (newTheme: Theme, e: React.MouseEvent<HTMLButtonElement>) => {
      if (typeof document !== 'undefined') {
        const overlay = document.getElementById('theme-transition-overlay');
        if (overlay) {
          overlay.style.setProperty('--x', `${e.clientX}px`);
          overlay.style.setProperty('--y', `${e.clientY}px`);
        }
      }
      setTheme(newTheme);
    },
    [setTheme]
  );

  const handleTabClick = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      if (isMobile && !compact) {
        onClose?.();
      }
    },
    [compact, isMobile, onClose, setActiveTab]
  );

  const handleFullLogout = useCallback(() => {
    fullLogout();
    if (isMobile) {
      onClose?.();
    }
  }, [fullLogout, isMobile, onClose]);

  const handleLockToggle = useCallback(() => {
    if (compact) {
      onExpand?.();
      return;
    }
    onClose?.();
  }, [compact, onClose, onExpand]);

  const isUnlocked = useVaultStore((state) => state.isUnlocked);
  const isVaultReady = useVaultStore((state) => state.isVaultReady);
  const isLoading = useVaultStore((state) => state.isLoading);

  return (
    <div
      id="primary-sidebar"
      role="navigation"
      aria-label="Sidebar"
      className={cn(
        'touch-pan-y flex h-screen w-[17.5rem] max-w-[85vw] flex-col bg-sidebar-bg backdrop-blur-xl transition-all duration-300 lg:w-64 print:hidden',
        compact && 'lg:w-20',
        sidebarPosition === 'right'
          ? 'border-l border-sidebar-border shadow-[-4px_0_24px_rgba(0,0,0,0.05)]'
          : 'border-r border-sidebar-border shadow-[4px_0_24px_rgba(0,0,0,0.05)]',
        className
      )}
      style={style}
    >
      <div
        className={cn(
          'flex items-center justify-between p-5 sm:p-6',
          compact && 'justify-center px-2 py-4'
        )}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleLockToggle}
            className={cn(
              'flex items-center justify-center bg-text text-bg shrink-0 border border-transparent shadow-sm transition hover:opacity-90 hover:shadow-md',
              compact ? 'h-12 w-12 rounded-lg' : 'h-10 w-10 rounded-lg'
            )}
            aria-label={compact ? 'Open sidebar' : 'Close sidebar'}
            aria-controls="primary-sidebar"
            aria-expanded={!compact}
          >
            <Lock className={cn('shrink-0', compact ? 'h-7 w-7' : 'h-5 w-5')} />
          </button>
          <div className={cn('flex flex-col', compact && 'hidden')}>
            <span className="text-lg font-bold tracking-tight text-text leading-tight">Vault</span>
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

      <nav
        className={cn(
          'custom-scrollbar flex-1 space-y-1.5 overflow-y-auto px-3 py-4',
          compact && 'px-2'
        )}
      >
        {groupedMenu.map((section) => (
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
                    'group flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-text/10',
                    compact && 'h-11 justify-center rounded-lg px-0',
                    isActive
                      ? 'bg-text text-bg shadow-sm'
                      : 'text-text/50 hover:border-text/10 hover:bg-text/5 hover:text-text'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-5 w-5 shrink-0',
                      isActive ? 'text-bg' : 'text-text/40 group-hover:text-text'
                    )}
                  />
                  {!compact && <span className="truncate">{item.label}</span>}
                </motion.button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={cn('space-y-3 border-t border-sidebar-border p-4', compact && 'px-2')}>
        {/* Theme Switch */}
        <div
          className={cn(
            'flex items-center gap-1 rounded-xl bg-text/5 p-1.5',
            compact && 'flex-col rounded-lg'
          )}
        >
          {themes.map((t) => {
            const Icon = t.icon;
            const isActive = theme === t.id;

            return (
              <button
                key={t.id}
                onClick={(e) => handleThemeChange(t.id, e)}
                className={cn(
                  'flex flex-1 items-center justify-center rounded-lg py-2 transition-all focus:outline-none focus:ring-2 focus:ring-text/10',
                  compact && 'w-full',
                  isActive ? 'bg-text text-bg' : 'text-text/40 hover:text-text hover:bg-text/5'
                )}
                aria-label={`Switch to ${t.label}`}
                aria-pressed={isActive}
                title={t.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        <CloudHealthIndicator compact={compact} />
        <div className="flex flex-col gap-2">
          <motion.button
            whileHover={{
              x: compact || isMobile ? 0 : sidebarPosition === 'right' ? -4 : 4,
            }}
            whileTap={{ scale: 0.96 }}
            onClick={handleFullLogout}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-500/5 hover:text-red-600 transition-all',
              compact && 'justify-center px-0'
            )}
            title="Sign Out"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!compact && <span>Sign Out</span>}
          </motion.button>
        </div>
      </div>
    </div>
  );
};
