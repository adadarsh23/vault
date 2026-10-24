import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { SETTINGS_SURFACE, SETTINGS_PANEL, SETTINGS_PANEL_SOFT } from './Utils';
import { formatKeysForPlatform } from '../../../../lib/platform';

export const SectionCard = React.memo<{
  title: string;
  description?: string;
  children: React.ReactNode;
}>(({ title, description, children }) => (
  <section className={SETTINGS_SURFACE}>
    <div className="mb-6 flex flex-col gap-2">
      <h2 className="text-xl font-bold text-text sm:text-2xl">{title}</h2>
      {description ? (
        <p className="max-w-3xl text-sm leading-6 text-text/45">{description}</p>
      ) : null}
    </div>
    {children}
  </section>
));
SectionCard.displayName = 'SectionCard';

export const StatCard = React.memo<{
  label: string;
  value: React.ReactNode;
  hint: string;
  icon: React.ElementType;
  iconClassName?: string;
}>(({ label, value, hint, icon: Icon, iconClassName = 'text-text/80' }) => (
  <div
    className={`${SETTINGS_PANEL} flex h-full flex-col justify-between gap-2.5 p-3.5 sm:p-4 min-w-0`}
  >
    <div className="flex items-center gap-2 min-w-0">
      <Icon className={`h-4 w-4 shrink-0 ${iconClassName}`} />
      <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] text-text/40 truncate">
        {label}
      </p>
    </div>
    <div className="space-y-1 min-w-0">
      <div className="text-base sm:text-lg font-bold leading-tight text-text truncate max-w-full">
        {value}
      </div>
      <p className="text-[11px] sm:text-xs leading-tight sm:leading-5 text-text/45 truncate">
        {hint}
      </p>
    </div>
  </div>
));
StatCard.displayName = 'StatCard';

export const ShortcutCard = React.memo<{
  label: string;
  keys: string[];
  description?: string;
  platform?: 'mac' | 'windows' | 'linux' | 'touch';
  isHighlighted?: boolean;
  badge?: string;
}>(({ label, keys, description, platform, isHighlighted, badge }) => {
  const formattedKeys = React.useMemo(() => {
    return platform ? formatKeysForPlatform(keys, platform) : keys;
  }, [keys, platform]);

  return (
    <div
      className={`shortcut-card-item ${SETTINGS_PANEL_SOFT} flex flex-col xs:flex-row xs:items-center justify-between gap-2 xs:gap-3.5 px-3.5 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 print:bg-white print:border-gray-300 print:text-black print:shadow-none print:break-inside-avoid ${
        isHighlighted
          ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/30'
          : 'hover:border-text/15 hover:bg-text/[0.04]'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <p
            className={`text-xs sm:text-sm font-semibold sm:font-medium leading-tight sm:leading-snug print:text-black ${isHighlighted ? 'text-emerald-400 font-semibold' : 'text-text'}`}
          >
            {label}
          </p>
          {badge && (
            <span className="rounded bg-text/10 px-1.5 py-0.5 text-[9px] font-semibold text-text/60 uppercase tracking-wider print:bg-gray-200 print:text-gray-800 shrink-0">
              {badge}
            </span>
          )}
        </div>
        {description ? (
          <p className="mt-0.5 text-[11px] sm:text-xs text-text/45 leading-relaxed print:text-gray-600">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap shrink-0 items-center gap-1 sm:gap-1.5 justify-start xs:justify-end mt-0.5 xs:mt-0">
        {formattedKeys.map((key, index) => (
          <kbd
            key={`${key}-${index}`}
            className={`inline-flex min-w-[22px] sm:min-w-[24px] h-5 sm:h-6 items-center justify-center rounded-md border px-1.5 sm:px-2 font-mono text-[10px] sm:text-[11px] font-bold shadow-sm transition-all print:border-gray-400 print:bg-gray-100 print:text-black print:shadow-none ${
              isHighlighted
                ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300 scale-105'
                : 'border-card-border bg-text/5 text-text/70'
            }`}
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
});
ShortcutCard.displayName = 'ShortcutCard';

export const ToggleCard = React.memo<{
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}>(({ title, description, checked, onChange }) => (
  <div className={`${SETTINGS_PANEL_SOFT} flex items-start justify-between gap-4 px-4 py-3`}>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="mt-1 text-xs leading-5 text-text/45">{description}</p>
    </div>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-1 transition-all ${
        checked ? 'border-text/20 bg-text text-bg' : 'border-card-border bg-text/10 text-text'
      }`}
      role="switch"
      aria-checked={checked}
      aria-label={title}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-current transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
));
ToggleCard.displayName = 'ToggleCard';

export const ActionButton = React.memo<{
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  className?: string;
}>(({ icon: Icon, label, onClick, loading, disabled, variant = 'secondary', className = '' }) => (
  <Button
    variant={variant}
    onClick={onClick}
    disabled={disabled || loading}
    className={`w-full justify-center sm:w-auto ${className}`}
  >
    {loading ? (
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
    ) : (
      <Icon className="mr-2 h-4 w-4" />
    )}
    {label}
  </Button>
));
ActionButton.displayName = 'ActionButton';
