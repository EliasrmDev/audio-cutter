import React from 'react'
import { clsx } from 'clsx'
import type { BaseComponentProps } from '@/types/audio'

export interface SliderProps extends BaseComponentProps {
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  onChangeStart?: () => void
  onChangeEnd?: () => void
  label?: string
  showValue?: boolean
  formatValue?: (value: number) => string
  orientation?: 'horizontal' | 'vertical'
  size?: 'sm' | 'md' | 'lg'
  trackColor?: string
  thumbColor?: string
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onChangeStart,
  onChangeEnd,
  disabled = false,
  label,
  showValue = false,
  formatValue,
  orientation = 'horizontal',
  size = 'md',
  className,
  'aria-label': ariaLabel,
  ...props
}: SliderProps) {
  const sliderId = React.useId()
  const [isDragging, setIsDragging] = React.useState(false)

  const percentage = ((value - min) / (max - min)) * 100

  const sizeClasses = {
    sm: orientation === 'horizontal' ? 'h-1' : 'w-1',
    md: orientation === 'horizontal' ? 'h-2' : 'w-2',
    lg: orientation === 'horizontal' ? 'h-3' : 'w-3'
  }

  const thumbSizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }

  const trackClasses = clsx(
    'relative rounded-full bg-border cursor-pointer transition-all duration-200',
    sizeClasses[size],
    {
      'opacity-50 cursor-not-allowed': disabled
    }
  )

  const fillClasses = clsx(
    'absolute rounded-full bg-primary transition-all duration-200',
    orientation === 'horizontal' ? 'h-full' : 'w-full',
    {
      'bg-primary-hover': isDragging && !disabled
    }
  )

  const thumbClasses = clsx(
    'absolute rounded-full bg-primary border-2 border-white shadow-lg',
    'transition-all duration-200 cursor-grab active:cursor-grabbing',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    thumbSizeClasses[size],
    {
      'opacity-50 cursor-not-allowed active:cursor-not-allowed': disabled,
      'scale-110 shadow-xl': isDragging && !disabled
    }
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value)
    onChange(newValue)
  }

  const handleMouseDown = () => {
    if (!disabled) {
      setIsDragging(true)
      onChangeStart?.()
    }
  }

  const handleMouseUp = () => {
    if (!disabled) {
      setIsDragging(false)
      onChangeEnd?.()
    }
  }

  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false)
        onChangeEnd?.()
      }
    }

    if (isDragging) {
      document.addEventListener('mouseup', handleGlobalMouseUp)
      document.addEventListener('touchend', handleGlobalMouseUp)

      return () => {
        document.removeEventListener('mouseup', handleGlobalMouseUp)
        document.removeEventListener('touchend', handleGlobalMouseUp)
      }
    }
  }, [isDragging, onChangeEnd])

  const displayValue = formatValue ? formatValue(value) : value.toString()

  return (
    <div className={clsx('space-y-2', className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-center">
          {label && (
            <label
              htmlFor={sliderId}
              className="text-sm font-medium text-foreground"
            >
              {label}
            </label>
          )}
          {showValue && (
            <span className="text-sm text-foreground-secondary font-mono">
              {displayValue}
            </span>
          )}
        </div>
      )}

      <div className="relative">
        {/* Custom styled track and thumb */}
        <div className={trackClasses}>
          <div
            className={fillClasses}
            style={{
              [orientation === 'horizontal' ? 'width' : 'height']: `${percentage}%`
            }}
          />
          <div
            className={thumbClasses}
            style={{
              [orientation === 'horizontal' ? 'left' : 'bottom']: `calc(${percentage}% - ${thumbSizeClasses[size].includes('h-3') ? '6px' : thumbSizeClasses[size].includes('h-4') ? '8px' : '10px'})`,
              [orientation === 'horizontal' ? 'top' : 'left']: '50%',
              transform: orientation === 'horizontal' ? 'translateY(-50%)' : 'translateX(-50%)'
            }}
          />
        </div>

        {/* Hidden native input for accessibility */}
        <input
          id={sliderId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          disabled={disabled}
          aria-label={ariaLabel || label}
          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          {...props}
        />
      </div>
    </div>
  )
}