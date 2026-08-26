import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  FileText,
  Key,
  ShieldCheck,
  Command,
  Tag,
  Image,
  Video,
  AudioLines,
  FilePlus,
  Box,
  Users,
  MessageSquareText,
  ListTodo,
  MapPin,
  CreditCard,
  Fingerprint,
  Wifi,
} from 'lucide-react';
import { useVaultStore } from '../../store/vaultStore';
import { requestGlobalItemNavigation } from '../../lib/global-navigation';
import { cn } from '../../lib/utils';
import { searchVaultItems, getHighlightedParts, FuzzySearchResult } from '../../lib/fuzzy';
import { TagBadge } from './TagManager';

interface TypeConfig {
  label: string;
  icon: React.ElementType;
  styles: {
    selected: string;
    iconBg: string;
    icon: string;
    tag: string;
  };
}

const TYPE_CONFIGS: Record<string, TypeConfig> = {
  // Personal Information
  identity: {
    label: 'Identities',
    icon: Fingerprint,
    styles: {
      selected: 'bg-lime-500/10 text-white border-l-2 border-lime-400 pl-[12px] shadow-inner',
      iconBg: 'bg-lime-500/5 group-hover:bg-lime-500/10',
      icon: 'text-lime-400',
      tag: 'bg-lime-500/5 border-lime-500/10 text-lime-400/70',
    },
  },
  contact: {
    label: 'Contacts',
    icon: Users,
    styles: {
      selected: 'bg-orange-500/10 text-white border-l-2 border-orange-400 pl-[12px] shadow-inner',
      iconBg: 'bg-orange-500/5 group-hover:bg-orange-500/10',
      icon: 'text-orange-400',
      tag: 'bg-orange-500/5 border-orange-500/10 text-orange-400/70',
    },
  },
  password: {
    label: 'Passwords',
    icon: Key,
    styles: {
      selected: 'bg-amber-500/10 text-white border-l-2 border-amber-400 pl-[12px] shadow-inner',
      iconBg: 'bg-amber-500/5 group-hover:bg-amber-500/10',
      icon: 'text-amber-400',
      tag: 'bg-amber-500/5 border-amber-500/10 text-amber-400/70',
    },
  },
  card: {
    label: 'Cards & Bank',
    icon: CreditCard,
    styles: {
      selected: 'bg-yellow-500/10 text-white border-l-2 border-yellow-400 pl-[12px] shadow-inner',
      iconBg: 'bg-yellow-500/5 group-hover:bg-yellow-500/10',
      icon: 'text-yellow-400',
      tag: 'bg-yellow-500/5 border-yellow-500/10 text-yellow-400/70',
    },
  },
  wifi: {
    label: 'Wi-Fi Networks',
    icon: Wifi,
    styles: {
      selected: 'bg-purple-500/10 text-white border-l-2 border-purple-400 pl-[12px] shadow-inner',
      iconBg: 'bg-purple-500/5 group-hover:bg-purple-500/10',
      icon: 'text-purple-400',
      tag: 'bg-purple-500/5 border-purple-500/10 text-purple-400/70',
    },
  },
  secret: {
    label: 'Secrets',
    icon: ShieldCheck,
    styles: {
      selected: 'bg-rose-500/10 text-white border-l-2 border-rose-400 pl-[12px] shadow-inner',
      iconBg: 'bg-rose-500/5 group-hover:bg-rose-500/10',
      icon: 'text-rose-400',
      tag: 'bg-rose-500/5 border-rose-500/10 text-rose-400/70',
    },
  },

  // Notes & Productivity
  note: {
    label: 'Notes',
    icon: FileText,
    styles: {
      selected: 'bg-emerald-500/10 text-white border-l-2 border-emerald-400 pl-[12px] shadow-inner',
      iconBg: 'bg-emerald-500/5 group-hover:bg-emerald-500/10',
      icon: 'text-emerald-400',
      tag: 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400/70',
    },
  },
  todo: {
    label: 'Todos',
    icon: ListTodo,
    styles: {
      selected: 'bg-fuchsia-500/10 text-white border-l-2 border-fuchsia-400 pl-[12px] shadow-inner',
      iconBg: 'bg-fuchsia-500/5 group-hover:bg-fuchsia-500/10',
      icon: 'text-fuchsia-400',
      tag: 'bg-fuchsia-500/5 border-fuchsia-500/10 text-fuchsia-400/70',
    },
  },
  chat: {
    label: 'Chats',
    icon: MessageSquareText,
    styles: {
      selected: 'bg-pink-500/10 text-white border-l-2 border-pink-400 pl-[12px] shadow-inner',
      iconBg: 'bg-pink-500/5 group-hover:bg-pink-500/10',
      icon: 'text-pink-400',
      tag: 'bg-pink-500/5 border-pink-500/10 text-pink-400/70',
    },
  },
  location: {
    label: 'Locations',
    icon: MapPin,
    styles: {
      selected: 'bg-cyan-500/10 text-white border-l-2 border-cyan-400 pl-[12px] shadow-inner',
      iconBg: 'bg-cyan-500/5 group-hover:bg-cyan-500/10',
      icon: 'text-cyan-400',
      tag: 'bg-cyan-500/5 border-cyan-500/10 text-cyan-400/70',
    },
  },

  // Media
  photo: {
    label: 'Photos',
    icon: Image,
    styles: {
      selected: 'bg-sky-500/10 text-white border-l-2 border-sky-400 pl-[12px] shadow-inner',
      iconBg: 'bg-sky-500/5 group-hover:bg-sky-500/10',
      icon: 'text-sky-400',
      tag: 'bg-sky-500/5 border-sky-500/10 text-sky-400/70',
    },
  },
  video: {
    label: 'Videos',
    icon: Video,
    styles: {
      selected: 'bg-indigo-500/10 text-white border-l-2 border-indigo-400 pl-[12px] shadow-inner',
      iconBg: 'bg-indigo-500/5 group-hover:bg-indigo-500/10',
      icon: 'text-indigo-400',
      tag: 'bg-indigo-500/5 border-indigo-500/10 text-indigo-400/70',
    },
  },
  audio: {
    label: 'Audio Files',
    icon: AudioLines,
    styles: {
      selected: 'bg-violet-500/10 text-white border-l-2 border-violet-400 pl-[12px] shadow-inner',
      iconBg: 'bg-violet-500/5 group-hover:bg-violet-500/10',
      icon: 'text-violet-400',
      tag: 'bg-violet-500/5 border-violet-500/10 text-violet-400/70',
    },
  },

  // Documents & Files
  document: {
    label: 'Documents',
    icon: FilePlus,
    styles: {
      selected: 'bg-teal-500/10 text-white border-l-2 border-teal-400 pl-[12px] shadow-inner',
      iconBg: 'bg-teal-500/5 group-hover:bg-teal-500/10',
      icon: 'text-teal-400',
      tag: 'bg-teal-500/5 border-teal-500/10 text-teal-400/70',
    },
  },
  file: {
    label: 'Other Files',
    icon: Box,
    styles: {
      selected: 'bg-blue-500/10 text-white border-l-2 border-blue-400 pl-[12px] shadow-inner',
      iconBg: 'bg-blue-500/5 group-hover:bg-blue-500/10',
      icon: 'text-blue-400',
      tag: 'bg-blue-500/5 border-blue-500/10 text-blue-400/70',
    },
  },
};

export const CommandPalette: React.FC = () => {
  const { items, isUnlocked } = useVaultStore();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for Ctrl+K / Cmd+K and custom open event (for mobile touch trigger)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isUnlocked) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
    };

    const handleOpenEvent = () => {
      if (!isUnlocked) return;
      setIsOpen(true);
      setQuery('');
      setSelectedIndex(0);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleOpenEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleOpenEvent);
    };
  }, [isUnlocked]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Perform client-side fuzzy search across all items
  const fuzzyResults = useMemo(() => {
    const results = searchVaultItems(items, query, TYPE_CONFIGS);
    if (!query.trim()) {
      // Sort default list by pinned first, then by updatedAt descending
      const sortedDefaults = [...results].sort((a, b) => {
        const aPinned = a.item.isPinned ? 1 : 0;
        const bPinned = b.item.isPinned ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        return b.item.updatedAt - a.item.updatedAt;
      });
      return sortedDefaults.slice(0, 8);
    }
    return results;
  }, [items, query]);

  // Group fuzzy results by type and sort items within each type by score descending
  const groupedItems = useMemo(() => {
    const groups: Record<string, FuzzySearchResult[]> = {};
    Object.keys(TYPE_CONFIGS).forEach((type) => {
      groups[type] = [];
    });

    fuzzyResults.forEach((result) => {
      if (groups[result.item.type]) {
        groups[result.item.type].push(result);
      }
    });

    return groups;
  }, [fuzzyResults]);

  // Flatten the grouped items in visual order so keyboard navigation index matches visual order
  const filteredItems = useMemo(() => {
    const flattened: FuzzySearchResult[] = [];
    Object.keys(TYPE_CONFIGS).forEach((type) => {
      const typeItems = groupedItems[type] || [];
      flattened.push(...typeItems);
    });
    return flattened;
  }, [groupedItems]);

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation inside the palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleSelectItem(filteredItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const handleSelectItem = (item: FuzzySearchResult) => {
    requestGlobalItemNavigation(item.item);
    setIsOpen(false);
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Highlight search term in title or tags using precise fuzzy character indices
  const renderFuzzyHighlightedText = (text: string, matches: number[]) => {
    if (!matches || matches.length === 0) return <span>{text}</span>;
    const parts = getHighlightedParts(text, matches);
    return (
      <span>
        {parts.map((part, i) =>
          part.isMatch ? (
            <mark
              key={i}
              className="bg-emerald-500/30 text-emerald-200 rounded px-0.5 py-0.2 font-bold decoration-clone"
            >
              {part.text}
            </mark>
          ) : (
            part.text
          ),
        )}
      </span>
    );
  };

  if (!isOpen) return null;

  const selectedItem = filteredItems[selectedIndex];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-md pt-[15vh] px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          ref={containerRef}
          className="w-full max-w-xl overflow-hidden rounded-2xl border border-card-border bg-gradient-to-b from-card-bg to-bg/95 backdrop-blur-xl shadow-2xl flex flex-col relative"
          onKeyDown={handleKeyDown}
        >
          {/* Subtle Glowing Header Accent */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500" />

          {/* Search Input Container */}
          <div className="relative flex items-center border-b border-card-border px-4 py-4">
            <Search className="h-5 w-5 text-text/30 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="ml-3.5 flex-1 bg-transparent text-text placeholder-text/30 focus:outline-none text-base border-none outline-none ring-0 focus:ring-0 p-0"
              placeholder="Search title, type, or #tag..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-text/35 bg-text/5 border border-text/10 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0 select-none">
                ESC
              </span>
            </div>
          </div>

          {/* Results List */}
          <div className="max-h-[350px] overflow-y-auto custom-scrollbar p-2.5 space-y-3.5">
            {filteredItems.length > 0 ? (
              <>
                {Object.entries(TYPE_CONFIGS).map(([type, config]) => {
                  const typeItems = groupedItems[type] || [];
                  if (typeItems.length === 0) return null;

                  const IconComponent = config.icon;

                  return (
                    <div key={type} className="space-y-1">
                      <p
                        className={`text-[10px] font-bold ${config.styles.icon} uppercase tracking-[0.2em] px-3.5 py-1`}
                      >
                        {config.label} ({typeItems.length})
                      </p>
                      {typeItems.map((item) => {
                        const isSelected = selectedItem?.item.id === item.item.id;
                        const tags = (item.item.metadata?.tags as string[]) || [];

                        return (
                          <button
                            key={item.item.id}
                            onClick={() => handleSelectItem(item)}
                            className={cn(
                              'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all duration-150 relative group',
                              isSelected
                                ? config.styles.selected
                                : 'hover:bg-text/5 text-text/75 hover:text-text border-l-2 border-transparent',
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={cn(
                                  'shrink-0 flex items-center justify-center h-8 w-8 rounded-lg transition-colors',
                                  config.styles.iconBg,
                                )}
                              >
                                <IconComponent className={cn('h-4.5 w-4.5', config.styles.icon)} />
                              </div>
                              <div className="truncate">
                                <p className="font-semibold text-sm truncate">
                                  {renderFuzzyHighlightedText(item.item.title, item.titleMatches)}
                                </p>
                                {item.transcriptSnippet && (
                                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-cyan-300/90 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20 max-w-full">
                                    <MessageSquareText className="h-3 w-3 shrink-0 text-cyan-400" />
                                    <span className="truncate italic">
                                      {item.transcriptMatches && item.transcriptMatches.length > 0
                                        ? renderFuzzyHighlightedText(
                                            item.transcriptSnippet,
                                            item.transcriptMatches,
                                          )
                                        : item.transcriptSnippet}
                                    </span>
                                  </div>
                                )}
                                {tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {tags.map((tag) => {
                                      const tagMatch = item.tagMatches.find((tm) => tm.tag === tag);
                                      return (
                                        <TagBadge
                                          key={tag}
                                          tag={tag}
                                          size="xs"
                                          highlightMatches={tagMatch?.matches}
                                        />
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="py-12 text-center text-text/40">
                <Command className="h-10 w-10 mx-auto text-text/10 mb-3 animate-pulse" />
                <p className="text-sm font-semibold">No secure items found</p>
                <p className="text-xs text-text/25 mt-1 max-w-[280px] mx-auto">
                  Try typing another title, type name, or use `#` to search by tag.
                </p>
              </div>
            )}
          </div>

          {/* Footer Guide Section */}
          <div className="flex items-center justify-between border-t border-card-border bg-white/[0.01] px-4 py-3 text-[10px] text-text/30 font-medium select-none">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="bg-text/5 border border-text/10 rounded px-1.5 py-0.5 text-[9px]">
                  ↑↓
                </kbd>{' '}
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-text/5 border border-text/10 rounded px-1.5 py-0.5 text-[9px]">
                  Enter
                </kbd>{' '}
                open
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-right">
              <Tag className="h-3 w-3 text-emerald-400/60" />
              <span>Type `#tag` to filter tags</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
