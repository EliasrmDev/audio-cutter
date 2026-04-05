import React from 'react'
import { clsx } from 'clsx'
import type { BaseComponentProps } from '@/types/audio'

export interface ButtonProps extends BaseComponentProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  onClick,
  type = 'button',
  'aria-label': ariaLabel,
  ...props
}: ButtonProps) {
  const baseClasses = [
    'inline-flex items-center justify-center font-medium rounded-md',
    'transition-all duration-200 focus-visible:outline-none',
    'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    'focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed',
    'relative overflow-hidden'
  ]

  const variantClasses = {
    primary: [
      'bg-primary text-white border border-primary',
      'hover:bg-primary-hover hover:border-primary-hover',
      'active:bg-primary-dark active:border-primary-dark'
    ],
    secondary: [
      'bg-background-secondary text-foreground border border-border',
      'hover:bg-background-tertiary hover:border-border-hover',
      'active:bg-border'
    ],
    ghost: [
      'bg-transparent text-foreground border border-transparent',
      'hover:bg-background-secondary hover:border-border',
      'active:bg-background-tertiary'
    ],
    danger: [
      'bg-red-600 text-white border border-red-600',
      'hover:bg-red-700 hover:border-red-700',
      'active:bg-red-800 active:border-red-800'
    ]
  }

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm min-h-[32px]',
    md: 'px-4 py-2 text-sm min-h-[40px]',
    lg: 'px-6 py-3 text-base min-h-[48px]'
  }

  const classes = clsx(
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    {
      'cursor-not-allowed': disabled || loading,
      'animate-pulse-glow': variant === 'primary' && !disabled && !loading
    },
    className
  )

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={classes}
      onClick={onClick}
      aria-label={ariaLabel}
      {...props}
    >
      {/* Shimmer effect for primary buttons */}
      {variant === 'primary' && !disabled && !loading && (
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -translate-x-full transition-transform duration-700 group-hover:translate-x-full" />
      )}

      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}

      <span className="relative flex items-center justify-center z-10">{children}</span>
    </button>
  )
}