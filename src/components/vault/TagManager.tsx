import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Tag as TagIcon, Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useVaultStore } from '../../store/vaultStore';
import { VaultItem } from '../../lib/storage';
import { logger } from '../../lib/logger';
import { cn } from '../../lib/utils';
import { getHighlightedParts } from '../../lib/fuzzy';

export type TagVariant =
  'default' | 'amber' | 'rose' | 'teal' | 'yellow' | 'blue' | 'purple' | 'cyan' | 'emerald';

export type TagSize = 'xs' | 'sm' | 'md';

const variantStyles: Record<
  TagVariant,
  {
    badge: string;
    hash: string;
    text: string;
    removeBtn: string;
  }
> = {
  default: {
    badge:
      'bg-white/[0.06] hover:bg-white/[0.09] border-white/10 hover:border-white/20 text-text/85',
    hash: 'text-text/35',
    text: 'text-text/85',
    removeBtn: 'text-text/40 hover:text-red-400 hover:bg-white/10',
  },
  amber: {
    badge:
      'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/20 hover:border-amber-500/30 text-amber-300',
    hash: 'text-amber-400/50',
    text: 'text-amber-300',
    removeBtn: 'text-amber-400/60 hover:text-red-400 hover:bg-amber-500/20',
  },
  rose: {
    badge:
      'bg-rose-500/10 hover:bg-rose-500/15 border-rose-500/20 hover:border-rose-500/30 text-rose-300',
    hash: 'text-rose-400/50',
    text: 'text-rose-300',
    removeBtn: 'text-rose-400/60 hover:text-red-400 hover:bg-rose-500/20',
  },
  teal: {
    badge:
      'bg-teal-500/10 hover:bg-teal-500/15 border-teal-500/20 hover:border-teal-500/30 text-teal-300',
    hash: 'text-teal-400/50',
    text: 'text-teal-300',
    removeBtn: 'text-teal-400/60 hover:text-red-400 hover:bg-teal-500/20',
  },
  yellow: {
    badge:
      'bg-yellow-500/10 hover:bg-yellow-500/15 border-yellow-500/20 hover:border-yellow-500/30 text-yellow-300',
    hash: 'text-yellow-400/50',
    text: 'text-yellow-300',
    removeBtn: 'text-yellow-400/60 hover:text-red-400 hover:bg-yellow-500/20',
  },
  blue: {
    badge:
      'bg-blue-500/10 hover:bg-blue-500/15 border-blue-500/20 hover:border-blue-500/30 text-blue-300',
    hash: 'text-blue-400/50',
    text: 'text-blue-300',
    removeBtn: 'text-blue-400/60 hover:text-red-400 hover:bg-blue-500/20',
  },
  purple: {
    badge:
      'bg-purple-500/10 hover:bg-purple-500/15 border-purple-500/20 hover:border-purple-500/30 text-purple-300',
    hash: 'text-purple-400/50',
    text: 'text-purple-300',
    removeBtn: 'text-purple-400/60 hover:text-red-400 hover:bg-purple-500/20',
  },
  cyan: {
    badge:
      'bg-cyan-500/10 hover:bg-cyan-500/15 border-cyan-500/20 hover:border-cyan-500/30 text-cyan-300',
    hash: 'text-cyan-400/50',
    text: 'text-cyan-300',
    removeBtn: 'text-cyan-400/60 hover:text-red-400 hover:bg-cyan-500/20',
  },
  emerald: {
    badge:
      'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/20 hover:border-emerald-500/30 text-emerald-300',
    hash: 'text-emerald-400/50',
    text: 'text-emerald-300',
    removeBtn: 'text-emerald-400/60 hover:text-red-400 hover:bg-emerald-500/20',
  },
};

const sizeStyles: Record<
  TagSize,
  {
    badge: string;
    icon: string;
    input: string;
    button: string;
  }
> = {
  xs: {
    badge: 'text-[9px] px-1.5 py-0.5 gap-0.5',
    icon: 'h-2 w-2',
    input: 'text-[9px] h-5 px-1.5 w-14',
    button: 'text-[9px] h-5 px-1.5 gap-0.5',
  },
  sm: {
    badge: 'text-[10px] px-2 py-0.5 gap-1',
    icon: 'h-2.5 w-2.5',
    input: 'text-[10px] h-5.5 px-2 w-16',
    button: 'text-[10px] h-5.5 px-2 gap-1',
  },
  md: {
    badge: 'text-xs px-2.5 py-1 gap-1.5',
    icon: 'h-3 w-3',
    input: 'text-xs h-6.5 px-2.5 w-20',
    button: 'text-xs h-6.5 px-2.5 gap-1.5',
  },
};

export interface TagBadgeProps {
  tag: string;
  onRemove?: (tag: string) => void;
  onClick?: (tag: string) => void;
  variant?: TagVariant;
  size?: TagSize;
  highlightMatches?: number[];
  disabled?: boolean;
  className?: string;
}

export const TagBadge: React.FC<TagBadgeProps> = React.memo(
  ({
    tag,
    onRemove,
    onClick,
    variant = 'default',
    size = 'sm',
    highlightMatches,
    disabled = false,
    className,
  }) => {
    const currentVariant = variantStyles[variant] || variantStyles.default;
    const currentSize = sizeStyles[size] || sizeStyles.sm;

    const renderContent = () => {
      if (!highlightMatches || highlightMatches.length === 0) {
        return <span>{tag}</span>;
      }
      const parts = getHighlightedParts(tag, highlightMatches);
      return (
        <span>
          {parts.map((part, i) =>
            part.isMatch ? (
              <mark
                key={i}
                className="bg-accent/40 text-accent-foreground rounded-xs px-0.5 font-bold"
              >
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </span>
      );
    };

    return (
      <span
        className={cn(
          'inline-flex items-center font-medium rounded-full border transition-all duration-150 select-none group/tag',
          currentVariant.badge,
          currentSize.badge,
          onClick && !disabled && 'cursor-pointer active:scale-95',
          className,
        )}
        onClick={onClick && !disabled ? () => onClick(tag) : undefined}
      >
        <span className={cn('font-mono font-semibold shrink-0 select-none', currentVariant.hash)}>
          #
        </span>
        <span className={cn('truncate max-w-[120px]', currentVariant.text)}>{renderContent()}</span>
        {onRemove && !disabled && (
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(tag);
            }}
            className={cn(
              'rounded-full p-0.5 transition-colors focus:outline-none focus:ring-1 focus:ring-white/20 shrink-0 ml-0.5 touch-manipulation cursor-pointer',
              currentVariant.removeBtn,
            )}
          >
            <X className={currentSize.icon} />
          </button>
        )}
      </span>
    );
  },
);

TagBadge.displayName = 'TagBadge';

export interface TagManagerProps {
  item?: VaultItem | null;
  tags?: string[];
  onAddTag?: (tag: string) => Promise<void> | void;
  onRemoveTag?: (tag: string) => Promise<void> | void;
  readOnly?: boolean;
  showLabel?: boolean;
  label?: string;
  size?: TagSize;
  variant?: TagVariant;
  placeholder?: string;
  className?: string;
}

export const TagManager: React.FC<TagManagerProps> = React.memo(
  ({
    item,
    tags: propTags,
    onAddTag,
    onRemoveTag,
    readOnly = false,
    showLabel = false,
    label = 'Tags:',
    size = 'sm',
    variant = 'default',
    placeholder = 'tag...',
    className,
  }) => {
    const updateItem = useVaultStore((state) => state.updateItem);
    const [isAdding, setIsAdding] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const isCancellingRef = useRef(false);
    const isSubmittingRef = useRef(false);

    const resolvedTags = useMemo<string[]>(() => {
      if (propTags) return propTags;
      if (item && Array.isArray(item.metadata?.tags)) {
        return item.metadata.tags as string[];
      }
      return [];
    }, [item, propTags]);

    useEffect(() => {
      if (isAdding) {
        isCancellingRef.current = false;
        inputRef.current?.focus();
      }
    }, [isAdding]);

    const cleanTag = (raw: string): string => {
      return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '');
    };

    const handleAdd = async () => {
      if (isCancellingRef.current || isSubmittingRef.current) {
        return;
      }

      const cleaned = cleanTag(inputValue);
      if (!cleaned) {
        setIsAdding(false);
        setInputValue('');
        return;
      }

      if (resolvedTags.includes(cleaned)) {
        toast.error('Tag already exists');
        setIsAdding(false);
        setInputValue('');
        return;
      }

      isSubmittingRef.current = true;
      setIsSubmitting(true);

      try {
        if (onAddTag) {
          await onAddTag(cleaned);
        } else if (item) {
          const updated = [...resolvedTags, cleaned];
          await updateItem(item.id, {
            metadata: { ...(item.metadata || {}), tags: updated },
          });
          toast.success(`Tag #${cleaned} added`);
        }
      } catch (err) {
        logger.error('Failed to add tag', { error: err, itemId: item?.id });
        toast.error('Failed to add tag');
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        setIsAdding(false);
        setInputValue('');
      }
    };

    const handleCancel = () => {
      isCancellingRef.current = true;
      setIsAdding(false);
      setInputValue('');
    };

    const handleRemove = async (tagToRemove: string) => {
      if (readOnly || isSubmitting) return;

      try {
        if (onRemoveTag) {
          await onRemoveTag(tagToRemove);
        } else if (item) {
          const updated = resolvedTags.filter((t) => t !== tagToRemove);
          await updateItem(item.id, {
            metadata: { ...(item.metadata || {}), tags: updated },
          });
          toast.success(`Tag #${tagToRemove} removed`);
        }
      } catch (err) {
        logger.error('Failed to remove tag', { error: err, itemId: item?.id });
        toast.error('Failed to remove tag');
      }
    };

    const currentSize = sizeStyles[size] || sizeStyles.sm;

    return (
      <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
        {showLabel && (
          <div className="flex items-center gap-1.5 text-text/45 text-xs font-semibold mr-1 shrink-0 select-none">
            <TagIcon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </div>
        )}

        {resolvedTags.map((tag) => (
          <TagBadge
            key={tag}
            tag={tag}
            variant={variant}
            size={size}
            onRemove={!readOnly ? handleRemove : undefined}
            disabled={isSubmitting}
          />
        ))}

        {!readOnly && (
          <>
            {isAdding ? (
              <div className="inline-flex items-center relative">
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 font-mono text-[9px] text-text/40 pointer-events-none select-none">
                  #
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  maxLength={40}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAdd();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      handleCancel();
                    }
                  }}
                  onBlur={handleAdd}
                  placeholder={placeholder}
                  disabled={isSubmitting}
                  className={cn(
                    'rounded-full bg-white/[0.08] border border-white/20 text-text placeholder:text-text/30 pl-3.5 pr-2 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 transition-all font-medium',
                    currentSize.input,
                  )}
                  autoFocus
                />
                {isSubmitting && (
                  <Loader2 className="h-2.5 w-2.5 animate-spin absolute right-1.5 top-1/2 -translate-y-1/2 text-text/40" />
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAdding(true);
                }}
                className={cn(
                  'inline-flex items-center rounded-full border border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.08] hover:border-white/30 text-text/50 hover:text-text transition-all font-medium focus:outline-none focus:ring-1 focus:ring-white/20 touch-manipulation cursor-pointer',
                  currentSize.button,
                )}
              >
                <Plus className={currentSize.icon} />
                <span>Tag</span>
              </button>
            )}
          </>
        )}
      </div>
    );
  },
);

TagManager.displayName = 'TagManager';
