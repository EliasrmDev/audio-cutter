import React from 'react'
import { clsx } from 'clsx'
import type { BaseComponentProps } from '@/types/audio'

export interface InputProps extends BaseComponentProps {
  type?: 'text' | 'number' | 'email' | 'password'
  value?: string | number
  defaultValue?: string | number
  placeholder?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  onFocus?: () => void
  min?: number
  max?: number
  step?: number
  required?: boolean
  error?: string
  label?: string
  icon?: React.ReactNode
  suffix?: string
  size?: 'sm' | 'md' | 'lg'
}

export function Input({
  type = 'text',
  value,
  defaultValue,
  placeholder,
  onChange,
  onBlur,
  onFocus,
  min,
  max,
  step,
  required = false,
  disabled = false,
  error,
  label,
  icon,
  suffix,
  size = 'md',
  className,
  'aria-label': ariaLabel,
  ...props
}: InputProps) {
  const inputId = React.useId()
  const errorId = React.useId()

  const baseClasses = [
    'w-full rounded-md border bg-background transition-all duration-200',
    'placeholder:text-foreground-muted focus-visible:outline-none',
    'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    'focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed'
  ]

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm min-h-[32px]',
    md: 'px-3 py-2 text-sm min-h-[40px]',
    lg: 'px-4 py-3 text-base min-h-[48px]'
  }

  const stateClasses = error
    ? 'border-red-500 text-foreground focus-visible:ring-red-500'
    : 'border-border text-foreground hover:border-border-hover focus-visible:border-primary'

  const inputClasses = clsx(
    baseClasses,
    sizeClasses[size],
    stateClasses,
    {
      'pl-10': icon,
      'pr-16': suffix
    }
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value)
  }

  return (
    <div className={clsx('space-y-1', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-foreground"
        >
          {label}
          {required && <span className="ml-1 text-red-500" aria-label="required">*</span>}
        </label>
      )}

      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-foreground-muted">
            {icon}
          </div>
        )}

        <input
          id={inputId}
          type={type}
          value={value}
          defaultValue={defaultValue}
          placeholder={placeholder}
          onChange={handleChange}
          onBlur={onBlur}
          onFocus={onFocus}
          min={min}
          max={max}
          step={step}
          required={required}
          disabled={disabled}
          aria-label={ariaLabel || label}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? errorId : undefined}
          className={inputClasses}
          {...props}
        />

        {suffix && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-foreground-secondary">
            {suffix}
          </div>
        )}
      </div>

      {error && (
        <p
          id={errorId}
          className="text-sm text-red-500"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}