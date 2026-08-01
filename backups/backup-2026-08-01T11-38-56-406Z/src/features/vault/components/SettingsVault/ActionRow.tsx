import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ActionRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  isLoadingAction?: boolean;
  danger?: boolean;
}

export const ActionRow: React.FC<ActionRowProps> = ({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
  isLoadingAction,
  danger,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full group relative overflow-hidden rounded-xl border border-card-border p-3 text-left transition-all hover:bg-text/5 hover:border-text/20 disabled:opacity-50 disabled:cursor-not-allowed ${danger ? 'hover:bg-red-500/10 hover:border-red-500/20' : ''}`}
  >
    <div className={`absolute -right-4 -top-4 h-16 w-16 rounded-full blur-2xl transition-all group-hover:scale-150 opacity-0 group-hover:opacity-100 ${danger ? 'bg-red-500/20' : 'bg-text/10'}`} />
    <div className="flex items-center gap-4 relative z-10">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors border border-card-border ${danger ? 'bg-red-500/10 text-red-400 group-hover:bg-red-500/20 border-red-500/20' : 'bg-text/5 text-text/60 group-hover:bg-text/10 group-hover:text-text border-text/10'}`}>
        <Icon className={`h-4 w-4 ${isLoadingAction ? 'animate-spin' : ''}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate transition-colors ${danger ? 'text-red-400 group-hover:text-red-300' : 'text-text'}`}>{title}</p>
        <p className={`text-[10px] uppercase tracking-widest mt-0.5 truncate transition-colors ${danger ? 'text-red-400/50' : 'text-text/40'}`}>{description}</p>
      </div>
    </div>
  </button>
);
