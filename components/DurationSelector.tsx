'use client'

import React, { useCallback } from 'react'
import { clsx } from 'clsx'
import {
  useAudioStore,
  useSelectionMode,
  useFixedDuration,
  usePlayer,
  useAudioFile,
} from '@/store/useAudioStore'

const PRESET_DURATIONS = [10, 20, 30] as const

interface DurationSelectorProps {
  className?: string
}

export function DurationSelector({ className }: DurationSelectorProps) {
  const selectionMode = useSelectionMode()
  const fixedDuration = useFixedDuration()
  const player = usePlayer()
  const audioFile = useAudioFile()

  const totalDuration = player.duration || audioFile?.duration || 0

  const handleManual = useCallback(() => {
    const { setSelectionMode, setFixedDuration } = useAudioStore.getState()
    setSelectionMode('manual')
    setFixedDuration(null)
    // Keep the existing selection — user can resize it manually again
  }, [])

  const handleFixed = useCallback((dur: number) => {
    const {
      setSelectionMode,
      setFixedDuration,
      setSelection,
      selection,
      player: p,
    } = useAudioStore.getState()

    // Safety: duration must fit within the audio
    const total = p.duration || 0
    if (total > 0 && dur > total) return

    setSelectionMode('fixed')
    setFixedDuration(dur)

    // Anchor window at current selection start, or playhead, or 0
    const anchorStart = selection ? selection.start : p.currentTime
    const clampedStart = Math.max(0, Math.min(Math.max(0, total - dur), anchorStart))
    setSelection({ start: clampedStart, end: clampedStart + dur, duration: dur })
  }, [])

  return (
    <div
      role="group"
      aria-label="Modo de selección por duración"
      className={clsx('flex items-center gap-1', className)}
    >
      <span className="text-[11px] text-foreground-muted mr-1 select-none" aria-hidden="true">
        Duración:
      </span>

      {/* Manual button */}
      <button
        type="button"
        onClick={handleManual}
        aria-pressed={selectionMode === 'manual'}
        aria-label="Selección manual (arrastre libre)"
        className={clsx(
          'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
          'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
          selectionMode === 'manual'
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-background border-border text-foreground-secondary hover:border-primary/50 hover:text-foreground'
        )}
      >
        Manual
      </button>

      {/* Fixed-duration preset buttons */}
      {PRESET_DURATIONS.map((dur) => {
        const disabled = totalDuration > 0 && dur > totalDuration
        const isActive = selectionMode === 'fixed' && fixedDuration === dur

        return (
          <button
            key={dur}
            type="button"
            onClick={() => handleFixed(dur)}
            disabled={disabled}
            aria-pressed={isActive}
            aria-label={`Seleccionar ${dur} segundos`}
            title={disabled ? `El audio es más corto que ${dur} s` : `Ventana fija de ${dur} s`}
            className={clsx(
              'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium tabular-nums transition-colors',
              'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
              disabled
                ? 'opacity-30 cursor-not-allowed border-border text-foreground-muted'
                : isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-foreground-secondary hover:border-primary/50 hover:text-foreground'
            )}
          >
            {dur}s
          </button>
        )
      })}
    </div>
  )
}
