import React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '../../../../components/ui/Button'
import { SETTINGS_SURFACE, SETTINGS_PANEL, SETTINGS_PANEL_SOFT } from './Utils'

export const SectionCard: React.FC<{
  title: string
  description?: string
  children: React.ReactNode
}> = ({ title, description, children }) => (
  <section className={SETTINGS_SURFACE}>
    <div className="mb-6 flex flex-col gap-2">
      <h2 className="text-xl font-bold text-text sm:text-2xl">{title}</h2>
      {description ? (
        <p className="max-w-3xl text-sm leading-6 text-text/45">
          {description}
        </p>
      ) : null}
    </div>
    {children}
  </section>
)

export const StatCard: React.FC<{
  label: string
  value: React.ReactNode
  hint: string
  icon: React.ElementType
  iconClassName?: string
}> = ({ label, value, hint, icon: Icon, iconClassName = 'text-text/80' }) => (
  <div
    className={`${SETTINGS_PANEL} flex h-full flex-col justify-between gap-3`}
  >
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${iconClassName}`} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text/40">
        {label}
      </p>
    </div>
    <div className="space-y-1.5">
      <div className="text-lg font-bold leading-tight text-text max-w-full">
        {value}
      </div>
      <p className="text-xs leading-5 text-text/45">{hint}</p>
    </div>
  </div>
)

export const ShortcutCard: React.FC<{
  label: string
  keys: string[]
  description?: string
}> = ({ label, keys, description }) => (
  <div
    className={`${SETTINGS_PANEL_SOFT} flex items-center justify-between gap-4 px-4 py-3`}
  >
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-text">{label}</p>
      {description ? (
        <p className="mt-1 text-xs text-text/45">{description}</p>
      ) : null}
    </div>
    <div className="flex shrink-0 items-center gap-1.5">
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className="inline-flex min-w-[20px] items-center justify-center rounded-md border border-card-border bg-text/5 px-1.5 py-0.5 font-sans text-[10px] font-bold text-text/60 shadow-sm"
        >
          {key}
        </kbd>
      ))}
    </div>
  </div>
)

export const ToggleCard: React.FC<{
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}> = ({ title, description, checked, onChange }) => (
  <div
    className={`${SETTINGS_PANEL_SOFT} flex items-start justify-between gap-4 px-4 py-3`}
  >
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="mt-1 text-xs leading-5 text-text/45">{description}</p>
    </div>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-1 transition-all ${
        checked
          ? 'border-text/20 bg-text text-bg'
          : 'border-card-border bg-text/10 text-text'
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
)

export const ActionButton: React.FC<{
  icon: React.ElementType
  label: string
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  className?: string
}> = ({
  icon: Icon,
  label,
  onClick,
  loading,
  disabled,
  variant = 'secondary',
  className = '',
}) => (
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
)
