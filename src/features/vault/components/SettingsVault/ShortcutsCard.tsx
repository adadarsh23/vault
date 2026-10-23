import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import {
  Keyboard,
  Type,
  Edit3,
  Download,
  MousePointer2,
  Search,
  Check,
  Copy,
  Printer,
  Smartphone,
  Laptop,
  Command,
  Monitor,
  Sparkles,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { SectionCard, ShortcutCard } from './SharedComponents';
import {
  detectDevice,
  getEffectivePlatform,
  matchesShortcut,
  PlatformType,
  DeviceInfo,
} from '../../../../lib/platform';

interface ShortcutDefinition {
  id: string;
  category: 'vault' | 'navigation' | 'editing' | 'security' | 'gestures';
  label: string;
  keys: string[];
  description: string;
  badge?: string;
}

const ALL_SHORTCUTS: ShortcutDefinition[] = [
  // Vault Operations
  {
    id: 'quick-search',
    category: 'vault',
    label: 'Quick Search / Command Palette',
    keys: ['Ctrl', 'K'],
    description: 'Open global search to instantly find items, tags, or settings',
    badge: 'Global',
  },
  {
    id: 'create-item',
    category: 'vault',
    label: 'Create New Item',
    keys: ['Ctrl', 'N'],
    description: 'Create a new encrypted item or note in current vault',
  },
  {
    id: 'lock-vault',
    category: 'vault',
    label: 'Immediately Lock Vault',
    keys: ['Ctrl', 'L'],
    description: 'Securely wipe memory state and lock vault session',
    badge: 'Security',
  },
  {
    id: 'copy-item',
    category: 'vault',
    label: 'Copy Content',
    keys: ['Ctrl', 'C'],
    description: 'Securely copy selected text or item details',
  },
  {
    id: 'delete-item',
    category: 'vault',
    label: 'Delete / Trash Item',
    keys: ['Delete'],
    description: 'Move highlighted vault item to trash',
  },

  // Navigation & Views
  {
    id: 'next-prev-item',
    category: 'navigation',
    label: 'Next / Previous Item',
    keys: ['←', '→'],
    description: 'Navigate back and forth between vault items',
  },
  {
    id: 'select-all',
    category: 'navigation',
    label: 'Select All Items',
    keys: ['Ctrl', 'A'],
    description: 'Select all visible items in active folder',
  },
  {
    id: 'toggle-layout',
    category: 'navigation',
    label: 'Toggle Grid / List Layout',
    keys: ['Ctrl', 'M'],
    description: 'Switch vault interface between grid and detail list view',
  },
  {
    id: 'toggle-fullscreen',
    category: 'navigation',
    label: 'Toggle Full Screen',
    keys: ['F11'],
    description: 'Enter or exit clutter-free full screen focus mode',
  },
  {
    id: 'history-nav',
    category: 'navigation',
    label: 'History Back / Forward',
    keys: ['Alt', '← / →'],
    description: 'Traverse navigation history stack',
  },

  // Text & Content Editing
  {
    id: 'undo-redo',
    category: 'editing',
    label: 'Undo / Redo Action',
    keys: ['Ctrl', 'Z'],
    description: 'Undo last edit or restore previous state',
  },
  {
    id: 'text-format',
    category: 'editing',
    label: 'Bold / Italic Formatting',
    keys: ['Ctrl', 'B'],
    description: 'Apply Markdown bold or italic formatting to selected text',
  },
  {
    id: 'insert-link',
    category: 'editing',
    label: 'Insert Hyperlink',
    keys: ['Ctrl', 'K'],
    description: 'Add or modify URL link in document editor',
  },
  {
    id: 'code-block',
    category: 'editing',
    label: 'Code Block Formatting',
    keys: ['Ctrl', 'Shift', 'C'],
    description: 'Format active text block as syntax-highlighted code',
  },
  {
    id: 'save-changes',
    category: 'editing',
    label: 'Save Document / Note',
    keys: ['Ctrl', 'S'],
    description: 'Encrypt and commit changes to local storage',
    badge: 'Auto-Save',
  },

  // Security & Export
  {
    id: 'export-item',
    category: 'security',
    label: 'Export Item Data',
    keys: ['Ctrl', 'E'],
    description: 'Export item payload in encrypted or JSON format',
  },
  {
    id: 'duplicate-item',
    category: 'security',
    label: 'Duplicate Item',
    keys: ['Ctrl', 'D'],
    description: 'Create an exact clone of selected entry',
  },
  {
    id: 'print-pdf',
    category: 'security',
    label: 'Print / Export PDF',
    keys: ['Ctrl', 'P'],
    description: 'Format and output item as print document or PDF',
  },
  {
    id: 'copy-password',
    category: 'security',
    label: 'Quick Copy Password',
    keys: ['Ctrl', 'Alt', 'C'],
    description: 'Directly copy secret password without exposing on screen',
  },
  {
    id: 'generate-credential',
    category: 'security',
    label: 'Generate Strong Password',
    keys: ['Ctrl', 'G'],
    description: 'Trigger high-entropy cryptographic password generator',
  },

  // Touch & Mouse Gestures
  {
    id: 'drag-drop-files',
    category: 'gestures',
    label: 'Drag & Drop File Upload',
    keys: ['Drag Files'],
    description: 'Drag external files directly into vault window to auto-encrypt',
    badge: 'Touch / Mouse',
  },
  {
    id: 'drag-item-folder',
    category: 'gestures',
    label: 'Move Entry to Folder',
    keys: ['Drag Item'],
    description: 'Drag item card over sidebar folder to re-organize',
  },
  {
    id: 'swipe-horizontal',
    category: 'gestures',
    label: 'Swipe Left / Right',
    keys: ['Swipe ↔'],
    description: 'Quickly switch media tabs or preview items on mobile',
  },
  {
    id: 'swipe-vertical',
    category: 'gestures',
    label: 'Swipe Up / Down',
    keys: ['Swipe ↕'],
    description: 'Smooth scroll content feed or close detail view modal',
  },
  {
    id: 'long-press',
    category: 'gestures',
    label: 'Long Press / Hold',
    keys: ['Hold 500ms'],
    description: 'Trigger quick context menu and action sheet on mobile',
  },
  {
    id: 'double-click-tap',
    category: 'gestures',
    label: 'Double Click / Double Tap',
    keys: ['Double Tap'],
    description: 'Open detailed item inspector mode',
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Controls' },
  { id: 'vault', label: 'Vault Operations', icon: Keyboard },
  { id: 'navigation', label: 'Navigation & Views', icon: Type },
  { id: 'editing', label: 'Text Editing', icon: Edit3 },
  { id: 'security', label: 'Export & Security', icon: Download },
  { id: 'gestures', label: 'Touch & Gestures', icon: MousePointer2 },
];

export const ShortcutsCard: React.FC = () => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    os: 'unknown',
    isTouch: false,
    isApple: false,
    platformName: 'Detecting...',
    userAgent: '',
  });

  const [platformMode, setPlatformMode] = useState<PlatformType>('auto');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [copiedSummary, setCopiedSummary] = useState(false);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live key press tester state
  const [isTesterActive, setIsTesterActive] = useState(false);
  const [lastPressedKeys, setLastPressedKeys] = useState<string[]>([]);
  const [matchedShortcutId, setMatchedShortcutId] = useState<string | null>(null);

  useEffect(() => {
    const info = detectDevice();
    setDeviceInfo(info);
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const effectivePlatform = useMemo(() => {
    return getEffectivePlatform(platformMode, deviceInfo.os, deviceInfo.isTouch);
  }, [platformMode, deviceInfo]);

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }, []);

  // Live Key Press Listener for Tester & Print shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Ctrl+P / Cmd+P print shortcut across the page
      const isCtrlOrCmd = e.metaKey || e.ctrlKey;
      if (isCtrlOrCmd && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrint();
        return;
      }

      // Don't intercept typing in input fields unless tester mode is explicitly focused
      const targetTag = (e.target as HTMLElement)?.tagName;
      const isInput =
        targetTag === 'INPUT' ||
        targetTag === 'TEXTAREA' ||
        (e.target as HTMLElement)?.isContentEditable;

      if (isInput && !isTesterActive) return;

      const pressed: string[] = [];
      if (e.metaKey || e.ctrlKey) {
        pressed.push(effectivePlatform === 'mac' ? '⌘' : 'Ctrl');
      }
      if (e.altKey) {
        pressed.push(effectivePlatform === 'mac' ? '⌥' : 'Alt');
      }
      if (e.shiftKey) {
        pressed.push(effectivePlatform === 'mac' ? '⇧' : 'Shift');
      }

      const keyName = e.key;
      if (!['Control', 'Meta', 'Alt', 'Shift'].includes(keyName)) {
        pressed.push(keyName.length === 1 ? keyName.toUpperCase() : keyName);
      }

      if (pressed.length > 0) {
        setLastPressedKeys(pressed);
      }

      // Check matching shortcut
      const found = ALL_SHORTCUTS.find((sc) => matchesShortcut(e, sc.keys));
      if (found) {
        setMatchedShortcutId(found.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [effectivePlatform, isTesterActive, handlePrint]);

  // Filter shortcuts with deferred search query for high frame-rate typing
  const filteredShortcuts = useMemo(() => {
    return ALL_SHORTCUTS.filter((shortcut) => {
      const matchesCat = activeCategory === 'all' || shortcut.category === activeCategory;
      if (!matchesCat) return false;

      if (!deferredSearchQuery.trim()) return true;

      const q = deferredSearchQuery.toLowerCase();
      const matchName = shortcut.label.toLowerCase().includes(q);
      const matchDesc = shortcut.description.toLowerCase().includes(q);
      const matchKeys = shortcut.keys.some((k) => k.toLowerCase().includes(q));

      return matchName || matchDesc || matchKeys;
    });
  }, [activeCategory, deferredSearchQuery]);

  const handleCopyCheatSheet = useCallback(() => {
    const text = ALL_SHORTCUTS.map(
      (sc) => `${sc.label}: [${sc.keys.join(' + ')}] - ${sc.description}`,
    ).join('\n');

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(`--- VAULT CONTROLS & SHORTCUTS CHEAT SHEET ---\n\n${text}`)
        .then(() => {
          setCopiedSummary(true);
          if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
          copyTimerRef.current = setTimeout(() => setCopiedSummary(false), 2000);
        })
        .catch(() => {
          // Ignore clipboard permission rejections gracefully
        });
    } else {
      setCopiedSummary(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedSummary(false), 2000);
    }
  }, []);

  return (
    <SectionCard
      title="Controls & Shortcuts"
      description="Cross-platform keyboard, mouse, and gesture shortcuts."
    >
      <div className="space-y-4 sm:space-y-6 print:space-y-4">
        {/* Device Compatibility Header & Platform Selector Toolbar */}
        <div className="flex flex-col gap-3 sm:gap-4 rounded-xl border border-card-border/80 bg-card/40 p-3 sm:p-4 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between print:border-gray-300 print:bg-white print:p-2">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg border border-card-border bg-text/5 text-text print:border-gray-300 print:bg-gray-100 print:text-black">
              {effectivePlatform === 'mac' ? (
                <Command className="h-4 w-4 sm:h-5 sm:w-5" />
              ) : effectivePlatform === 'touch' ? (
                <Smartphone className="h-4 w-4 sm:h-5 sm:w-5" />
              ) : (
                <Laptop className="h-4 w-4 sm:h-5 sm:w-5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-xs sm:text-sm font-semibold text-text print:text-black">
                  Active Device Mode:
                </span>
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] sm:text-xs font-semibold text-emerald-400 border border-emerald-500/20 print:bg-gray-200 print:text-black print:border-gray-300 truncate max-w-[200px] sm:max-w-none">
                  {effectivePlatform === 'mac'
                    ? 'macOS (Apple Keybindings)'
                    : effectivePlatform === 'windows'
                      ? 'Windows (PC Keybindings)'
                      : effectivePlatform === 'linux'
                        ? 'Linux Desktop'
                        : 'Touch / Mobile Gestures'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-text/40 mt-0.5 print:text-gray-600 truncate">
                Detected: {deviceInfo.platformName} • Touch Input:{' '}
                {deviceInfo.isTouch ? 'Supported' : 'Disabled'}
              </p>
            </div>
          </div>

          {/* OS Switcher Toggle */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-lg border border-card-border bg-text/5 p-1 print:hidden max-w-full">
            <button
              onClick={() => setPlatformMode('auto')}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 sm:px-2.5 py-1 text-xs font-medium transition-all ${
                platformMode === 'auto'
                  ? 'bg-text text-bg shadow-sm'
                  : 'text-text/60 hover:text-text hover:bg-text/5'
              }`}
              title="Auto-detect platform based on browser environment"
            >
              <Sparkles className="h-3 w-3" />
              Auto
            </button>

            <button
              onClick={() => setPlatformMode('mac')}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 sm:px-2.5 py-1 text-xs font-medium transition-all ${
                platformMode === 'mac'
                  ? 'bg-text text-bg shadow-sm'
                  : 'text-text/60 hover:text-text hover:bg-text/5'
              }`}
            >
              <Command className="h-3 w-3" />
              macOS
            </button>

            <button
              onClick={() => setPlatformMode('windows')}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 sm:px-2.5 py-1 text-xs font-medium transition-all ${
                platformMode === 'windows'
                  ? 'bg-text text-bg shadow-sm'
                  : 'text-text/60 hover:text-text hover:bg-text/5'
              }`}
            >
              <Monitor className="h-3 w-3" />
              Windows
            </button>

            <button
              onClick={() => setPlatformMode('touch')}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 sm:px-2.5 py-1 text-xs font-medium transition-all ${
                platformMode === 'touch'
                  ? 'bg-text text-bg shadow-sm'
                  : 'text-text/60 hover:text-text hover:bg-text/5'
              }`}
            >
              <Smartphone className="h-3 w-3" />
              Touch
            </button>
          </div>
        </div>

        {/* Live Key Press & Gesture Tester Box - Hidden on Print */}
        <div
          tabIndex={0}
          onFocus={() => setIsTesterActive(true)}
          onBlur={() => setIsTesterActive(false)}
          className={`hidden lg:block relative overflow-hidden rounded-xl border p-3.5 sm:p-4 transition-all duration-300 print:hidden ${
            isTesterActive
              ? 'border-emerald-500/60 bg-emerald-500/[0.04] ring-2 ring-emerald-500/20'
              : 'border-card-border bg-card/20 hover:border-text/20'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
            <div className="space-y-0.5 sm:space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-text/80">
                  Interactive Live Keyboard & Gesture Tester
                </h4>
              </div>
              <p className="text-[11px] sm:text-xs text-text/40">
                Click here and press any key combo or gesture to test compatibility and highlight
                matches in real-time.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {lastPressedKeys.length > 0 && (
                <button
                  onClick={() => {
                    setLastPressedKeys([]);
                    setMatchedShortcutId(null);
                  }}
                  className="flex items-center gap-1 text-[11px] font-medium text-text/40 hover:text-text transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Pressed Key Display */}
          <div className="mt-3 flex min-h-[44px] flex-wrap items-center justify-center gap-2 rounded-lg border border-card-border/60 bg-text/[0.03] p-2">
            {lastPressedKeys.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-2 animate-in fade-in zoom-in-95 duration-150">
                <span className="text-xs text-text/40 mr-1">Detected Input:</span>
                {lastPressedKeys.map((k, idx) => (
                  <kbd
                    key={idx}
                    className="inline-flex min-w-[26px] sm:min-w-[28px] h-6 sm:h-7 items-center justify-center rounded border border-emerald-400/50 bg-emerald-500/20 px-2 font-mono text-xs font-bold text-emerald-300 shadow-md animate-bounce"
                  >
                    {k}
                  </kbd>
                ))}

                {matchedShortcutId && (
                  <span className="ml-1 sm:ml-2 rounded-full bg-emerald-500/20 px-2 sm:px-2.5 py-0.5 text-[11px] sm:text-xs font-semibold text-emerald-400 border border-emerald-500/30">
                    Matched Shortcut!
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs italic text-text/30 text-center">
                [ Waiting for key press e.g.{' '}
                <kbd className="font-mono not-italic px-1 py-0.5 rounded border border-card-border bg-text/5 text-text/60">
                  {effectivePlatform === 'mac' ? '⌘' : 'Ctrl'}
                </kbd>{' '}
                +{' '}
                <kbd className="font-mono not-italic px-1 py-0.5 rounded border border-card-border bg-text/5 text-text/60">
                  K
                </kbd>{' '}
                ]
              </p>
            )}
          </div>
        </div>

        {/* Search Input and Toolbar - Hidden on Print */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts by name, key (e.g. Ctrl, ⌘, Lock, Save)..."
              className="w-full rounded-lg border border-card-border bg-text/5 py-2 pl-9 pr-8 text-xs font-medium text-text placeholder:text-text/30 focus:border-text/40 focus:outline-none focus:ring-1 focus:ring-text/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text/40 hover:text-text"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleCopyCheatSheet}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg border border-card-border bg-text/5 px-3 py-2 text-xs font-medium text-text/70 hover:bg-text/10 hover:text-text transition-all active:scale-[0.98]"
              title="Copy text summary of all shortcuts"
            >
              {copiedSummary ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedSummary ? 'Copied!' : 'Copy'}
            </button>

            <button
              onClick={handlePrint}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg border border-card-border bg-text/5 px-3 py-2 text-xs font-medium text-text/70 hover:bg-text/10 hover:text-text transition-all active:scale-[0.98]"
              title="Print reference sheet"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
          </div>
        </div>

        {/* Category Pills - Hidden on Print */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2.5 border-b border-card-border/60 print:hidden -mx-1 px-1">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-all min-h-[34px] ${
                  isActive
                    ? 'bg-text text-bg shadow-sm font-semibold'
                    : 'text-text/60 hover:bg-text/5 hover:text-text'
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Shortcuts Grid Display */}
        {filteredShortcuts.length > 0 ? (
          <div className="grid gap-2.5 sm:gap-3 grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 print:grid-cols-2 print:gap-2">
            {filteredShortcuts.map((shortcut) => {
              const isMatched = matchedShortcutId === shortcut.id;
              return (
                <ShortcutCard
                  key={shortcut.id}
                  label={shortcut.label}
                  keys={shortcut.keys}
                  description={shortcut.description}
                  platform={effectivePlatform}
                  isHighlighted={isMatched}
                  badge={shortcut.badge}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-card-border rounded-xl">
            <SlidersHorizontal className="h-8 w-8 text-text/20 mb-2" />
            <p className="text-sm font-semibold text-text/60">No matching shortcuts found</p>
            <p className="text-xs text-text/40 mt-1">
              Try adjusting your search query or category filter
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default ShortcutsCard;
