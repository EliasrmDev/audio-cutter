'use client'

import React, { useId } from 'react'
import { clsx } from 'clsx'
import { formatBytes } from '@/lib/audioExporter'

const BITRATE_PRESETS = [96, 128, 160, 192, 256, 320] as const

const QUALITY_LABELS: Record<number, { label: string; color: string }> = {
  96:  { label: 'Archivo más ligero', color: 'text-amber-400' },
  128: { label: 'Calidad básica',      color: 'text-amber-300' },
  160: { label: 'Equilibrado',         color: 'text-yellow-300' },
  192: { label: 'Buena calidad',       color: 'text-lime-400'  },
  256: { label: 'Alta calidad',        color: 'text-green-400' },
  320: { label: 'Máxima calidad',      color: 'text-emerald-400' },
}

export interface CompressionSettingsProps {
  bitrate: number
  onChange: (bitrate: number) => void
  estimatedBytes: number | null
  className?: string
}

export function CompressionSettings({
  bitrate,
  onChange,
  estimatedBytes,
  className,
}: CompressionSettingsProps) {
  const legendId = useId()
  const meta = QUALITY_LABELS[bitrate] ?? QUALITY_LABELS[128]

  return (
    <div className={clsx('space-y-2', className)}>
      <div
        role="group"
        aria-labelledby={legendId}
        className="space-y-2"
      >
        <div className="flex items-center justify-between">
          <span id={legendId} className="text-xs font-medium text-foreground-secondary">
            Bitrate (kbps)
          </span>
          <span className={clsx('text-xs font-medium tabular-nums', meta.color)}>
            {bitrate} kbps — {meta.label}
          </span>
        </div>

        {/* Preset buttons */}
        <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label="Seleccionar bitrate">
          {BITRATE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={bitrate === preset}
              aria-label={`${preset} kbps — ${QUALITY_LABELS[preset].label}`}
              onClick={() => onChange(preset)}
              className={clsx(
                'px-2.5 py-1 rounded text-[11px] font-medium tabular-nums transition-colors',
                'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                bitrate === preset
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-foreground-secondary hover:border-primary/50 hover:text-foreground'
              )}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Size estimate */}
      {estimatedBytes !== null && (
        <p className="text-[11px] text-foreground-muted">
          Tamaño estimado:{' '}
          <span className="font-medium text-foreground-secondary">
            {formatBytes(estimatedBytes)}
          </span>
        </p>
      )}
    </div>
  )
}
