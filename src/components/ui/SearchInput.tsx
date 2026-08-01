import * as React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Clock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { Input } from './Input';

export interface SearchInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange'
> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  suggestions?: string[];
  historyKey?: string;
  containerClassName?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      suggestions = [],
      historyKey,
      className,
      containerClassName,
      placeholder,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [history, setHistory] = useState<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    // Load search history from localStorage on mount
    useEffect(() => {
      if (!historyKey) return;
      try {
        const stored = localStorage.getItem(`vault_search_history_${historyKey}`);
        if (stored) {
          setHistory(JSON.parse(stored));
        }
      } catch (err) {
        console.error('Failed to load search history', err);
      }
    }, [historyKey]);

    // Save history helper
    const saveHistory = (newHistory: string[]) => {
      if (!historyKey) return;
      try {
        localStorage.setItem(`vault_search_history_${historyKey}`, JSON.stringify(newHistory));
      } catch (err) {
        console.error('Failed to save search history', err);
      }
    };

    const selectSuggestion = (val: string) => {
      // Simulate ChangeEvent
      const event = {
        target: { value: val },
        currentTarget: { value: val },
      } as React.ChangeEvent<HTMLInputElement>;

      onChange(event);

      // Add to history
      if (historyKey && val && val.trim()) {
        const trimmed = val.trim();
        const filtered = history.filter((h) => h !== trimmed);
        const updated = [trimmed, ...filtered].slice(0, 5);
        setHistory(updated);
        saveHistory(updated);
      }

      setIsOpen(false);
      setActiveIndex(-1);
    };

    const handleRemoveHistory = (item: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!historyKey) return;
      const updated = history.filter((h) => h !== item);
      setHistory(updated);
      saveHistory(updated);
      setActiveIndex(-1);
    };

    const handleClearAllHistory = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!historyKey) return;
      setHistory([]);
      saveHistory([]);
      setActiveIndex(-1);
    };

    const uniqueSuggestions = useMemo(() => {
      return Array.from(new Set(suggestions.filter(Boolean)));
    }, [suggestions]);

    const filteredSuggestions = useMemo(() => {
      if (!value || !value.trim()) return [];
      const trimmed = value.trim().toLowerCase();
      return uniqueSuggestions
        .filter((s) => s.toLowerCase().includes(trimmed) && s.toLowerCase() !== trimmed)
        .slice(0, 5);
    }, [value, uniqueSuggestions]);

    const filteredHistory = useMemo(() => {
      const trimmed = value.trim().toLowerCase();
      if (!value || !value.trim()) {
        return history;
      }
      return history.filter(
        (h) =>
          h.toLowerCase().includes(trimmed) &&
          h.toLowerCase() !== trimmed &&
          !filteredSuggestions.some((s) => s.toLowerCase() === h.toLowerCase())
      );
    }, [value, history, filteredSuggestions]);

    const listItems = useMemo(() => {
      const items: { value: string; type: 'history' | 'suggestion' }[] = [];
      filteredHistory.forEach((h) => items.push({ value: h, type: 'history' }));
      filteredSuggestions.forEach((s) => items.push({ value: s, type: 'suggestion' }));
      return items;
    }, [filteredHistory, filteredSuggestions]);

    // Reset active index when suggestions change
    useEffect(() => {
      setActiveIndex(-1);
    }, [listItems.length]);

    // Close on click outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (listItems.length > 0 && isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % listItems.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 + listItems.length) % listItems.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < listItems.length) {
            selectSuggestion(listItems[activeIndex].value);
          } else {
            if (value && value.trim()) {
              selectSuggestion(value);
            }
            setIsOpen(false);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setIsOpen(false);
        }
      } else {
        if (e.key === 'Enter' && value && value.trim()) {
          selectSuggestion(value);
        }
      }

      if (props.onKeyDown) {
        props.onKeyDown(e);
      }
    };

    const highlightMatch = (text: string, query: string) => {
      if (!query || !query.trim()) return <span>{text}</span>;
      const trimmed = query.trim();
      const regex = new RegExp(`(${trimmed.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      return (
        <>
          {parts.map((part, i) =>
            regex.test(part) ? (
              <mark
                key={i}
                className="bg-transparent text-emerald-600 dark:text-emerald-400 font-semibold"
              >
                {part}
              </mark>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </>
      );
    };

    const showDropdown = isOpen && listItems.length > 0;

    return (
      <div ref={containerRef} className={cn('relative w-full', containerClassName)}>
        <Input
          ref={ref}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className={className}
          {...props}
        />
        <AnimatePresence>
          {showDropdown && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="absolute top-full left-0 right-0 mt-2 z-50 overflow-hidden rounded-xl border border-card-border bg-card-bg/95 backdrop-blur-md shadow-2xl max-h-[280px] overflow-y-auto animate-in fade-in-0 slide-in-from-top-2 duration-200"
            >
              {/* History Section */}
              {filteredHistory.length > 0 && (
                <div className="p-2 border-b border-card-border last:border-b-0">
                  <div className="flex items-center justify-between px-2.5 py-1.5 text-[10px] font-bold tracking-wider text-text/40 uppercase">
                    <span>Recent Searches</span>
                    {value === '' && (
                      <button
                        onClick={handleClearAllHistory}
                        className="hover:text-destructive transition-colors normal-case font-medium cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {listItems
                      .map((item, idx) => ({ item, idx }))
                      .filter(({ item }) => item.type === 'history')
                      .map(({ item, idx }) => (
                        <div
                          key={`hist-${item.value}-${idx}`}
                          onClick={() => selectSuggestion(item.value)}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={cn(
                            'flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-all select-none',
                            activeIndex === idx ? 'bg-text/5 text-text' : 'text-text/70'
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Clock className="h-3.5 w-3.5 text-text/30 shrink-0" />
                            <span className="truncate">{highlightMatch(item.value, value)}</span>
                          </div>
                          <button
                            onClick={(e) => handleRemoveHistory(item.value, e)}
                            className="p-1 rounded-md text-text/20 hover:text-destructive hover:bg-text/5 cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                            style={{ opacity: activeIndex === idx ? 1 : 0 }}
                            aria-label="Remove search history item"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Suggestions Section */}
              {filteredSuggestions.length > 0 && (
                <div className="p-2">
                  <div className="px-2.5 py-1.5 text-[10px] font-bold tracking-wider text-text/40 uppercase">
                    <span>Suggestions</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {listItems
                      .map((item, idx) => ({ item, idx }))
                      .filter(({ item }) => item.type === 'suggestion')
                      .map(({ item, idx }) => (
                        <div
                          key={`sug-${item.value}-${idx}`}
                          onClick={() => selectSuggestion(item.value)}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={cn(
                            'flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-all select-none',
                            activeIndex === idx ? 'bg-text/5 text-text' : 'text-text/70'
                          )}
                        >
                          <Search className="h-3.5 w-3.5 text-text/30 shrink-0" />
                          <span className="truncate">{highlightMatch(item.value, value)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';
