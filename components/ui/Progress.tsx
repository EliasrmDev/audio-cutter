import React from 'react'
import { clsx } from 'clsx'

export interface ProgressProps {
  value: number
  max?: number
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'success' | 'warning' | 'danger'
  showValue?: boolean
  className?: string
  'aria-label'?: string
}

export function Progress({
  value,
  max = 100,
  size = 'md',
  variant = 'default',
  showValue = false,
  className,
  'aria-label': ariaLabel = 'Progress'
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  }

  const variantClasses = {
    default: 'bg-primary',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    danger: 'bg-red-500'
  }

  return (
    <div className={clsx('space-y-1', className)}>
      {showValue && (
        <div className="flex justify-between text-sm text-foreground-secondary">
          <span>{ariaLabel}</span>
          <span className="font-mono">{Math.round(percentage)}%</span>
        </div>
      )}

      <div
        className={clsx(
          'w-full bg-border rounded-full overflow-hidden',
          sizeClasses[size]
        )}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemax={max}
        aria-label={ariaLabel}
      >
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-300 ease-out',
            variantClasses[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}