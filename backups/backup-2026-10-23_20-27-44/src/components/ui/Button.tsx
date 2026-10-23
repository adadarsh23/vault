import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
}

const variants = {
  primary: 'bg-text text-bg hover:bg-text/90 transition-colors shadow-lg shadow-text/5',
  secondary: 'bg-text/10 text-text hover:bg-text/20 transition-colors',
  outline: 'border border-card-border text-text hover:bg-text/10 transition-colors',
  ghost: 'text-text hover:bg-text/10 transition-colors',
  danger: 'bg-red-500 text-white hover:bg-red-600 transition-colors',
} as const;

const sizes = {
  xs: 'h-7 px-2 text-[10px]',
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 py-2',
  lg: 'h-12 px-8 text-lg font-bold',
  icon: 'h-10 w-10',
} as const;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      children,
      type = 'button',
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 relative touch-manipulation select-none',
          variants[variant],
          sizes[size],
          loading && 'text-transparent',
          className,
        )}
        ref={ref}
        type={type}
        disabled={loading || disabled}
        aria-busy={loading ? 'true' : undefined}
        {...props}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          </div>
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button };
