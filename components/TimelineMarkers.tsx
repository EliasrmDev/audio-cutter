'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { MapPin, Trash2, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import { useWaveformContext } from '@/contexts/WaveformContext'
import { useAudioStore, useSelection, usePlayer } from '@/store/useAudioStore'
import { Button } from '@/components/ui'
import { formatTime } from '@/lib/audioUtils'
import type { BaseComponentProps, AudioSelection } from '@/types/audio'

export interface TimelineMarkersProps extends BaseComponentProps {}

interface Marker {
  id: string
  label: string
  time: number
  type: 'start' | 'end' | 'custom'
}

/**
 * Displays and manages selection start/end markers.
 * Allows clicking a marker to seek, and removing custom markers.
 */
export function TimelineMarkers({ className, 'aria-label': ariaLabel = 'Timeline markers' }: TimelineMarkersProps) {
  const { seekTo, isReady } = useWaveformContext()
  const selection = useSelection()
  const player = usePlayer()
  const { setSelection } = useAudioStore()

  const [customMarkers, setCustomMarkers] = useState<Marker[]>([])

  const markers: Marker[] = [
    ...(selection
      ? [
          { id: 'sel-start', label: 'Start', time: selection.start, type: 'start' as const },
          { id: 'sel-end', label: 'End', time: selection.end, type: 'end' as const },
        ]
      : []),
    ...customMarkers,
  ]

  const handleMarkerClick = useCallback(
    (time: number) => {
      if (!isReady) return
      seekTo(time)
    },
    [isReady, seekTo]
  )

  const handleAddCurrentTimeMarker = useCallback(() => {
    const { player: livePlayer } = useAudioStore.getState()
    const time = livePlayer.currentTime
    setCustomMarkers(prev => [
      ...prev,
      { id: `marker_${Date.now()}`, label: `M${prev.length + 1}`, time, type: 'custom' },
    ])
  }, [])

  // Listen for keyboard shortcut dispatched by WaveformEditor
  useEffect(() => {
    const handler = () => handleAddCurrentTimeMarker()
    window.addEventListener('waveform:addmarker', handler)
    return () => window.removeEventListener('waveform:addmarker', handler)
  }, [handleAddCurrentTimeMarker])

  const handleRemoveMarker = useCallback((id: string) => {
    setCustomMarkers(prev => prev.filter(m => m.id !== id))
  }, [])

  const handleSetAsStart = useCallback(
    (time: number) => {
      if (!selection) {
        setSelection({ start: time, end: Math.min(time + 10, player.duration), duration: Math.min(10, player.duration - time) })
      } else {
        const end = Math.max(time + 0.1, selection.end)
        setSelection({ start: time, end, duration: end - time })
      }
    },
    [selection, setSelection, player.duration]
  )

  const handleSetAsEnd = useCallback(
    (time: number) => {
      if (!selection) {
        const start = Math.max(0, time - 10)
        setSelection({ start, end: time, duration: time - start })
      } else {
        const start = Math.min(selection.start, time - 0.1)
        setSelection({ start, end: time, duration: time - start })
      }
    },
    [selection, setSelection]
  )

  return (
    <div
      className={clsx(
        'flex flex-col gap-2 px-4 py-3 bg-background-secondary border border-border rounded-lg',
        className
      )}
      role="region"
      aria-label={ariaLabel}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider">
          Markers
        </h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleAddCurrentTimeMarker}
          disabled={!isReady}
          aria-label={`Add marker at ${formatTime(player.currentTime)}`}
          className="text-xs text-foreground-muted hover:text-primary"
        >
          <MapPin size={13} className="mr-1" aria-hidden="true" />
          Add at {formatTime(player.currentTime)}
        </Button>
      </div>

      {markers.length === 0 ? (
        <p className="text-xs text-foreground-muted italic py-1">
          No markers. Make a selection or add one manually.
        </p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Marker list">
          {markers.map(marker => (
            <li
              key={marker.id}
              className={clsx(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs group',
                'bg-background-tertiary hover:bg-background border border-transparent hover:border-border',
                'transition-colors'
              )}
            >
              {/* Color dot */}
              <span
                className={clsx(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  marker.type === 'start' && 'bg-green-500',
                  marker.type === 'end' && 'bg-red-400',
                  marker.type === 'custom' && 'bg-primary'
                )}
                aria-hidden="true"
              />

              {/* Label */}
              <span className="font-medium text-foreground-secondary w-12 truncate">
                {marker.label}
              </span>

              {/* Time – clickable seek */}
              <button
                className="font-mono tabular-nums text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                onClick={() => handleMarkerClick(marker.time)}
                aria-label={`Seek to ${formatTime(marker.time)}`}
                title={`Click to seek to ${formatTime(marker.time)}`}
              >
                {formatTime(marker.time)}
              </button>

              {/* Actions – only visible on hover/focus */}
              <div className="flex items-center gap-1 ml-auto">
                {marker.type === 'custom' && (
                  <>
                    <button
                      className="text-foreground-muted hover:text-green-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded px-1 text-[11px]"
                      onClick={() => handleSetAsStart(marker.time)}
                      aria-label={`Set ${formatTime(marker.time)} as selection start`}
                      title="Set as selection start"
                    >
                      Set start
                    </button>
                    <button
                      className="text-foreground-muted hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded px-1 text-[11px]"
                      onClick={() => handleSetAsEnd(marker.time)}
                      aria-label={`Set ${formatTime(marker.time)} as selection end`}
                      title="Set as selection end"
                    >
                      Set end
                    </button>
                    <button
                      className="text-foreground-muted hover:text-red-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded p-0.5"
                      onClick={() => handleRemoveMarker(marker.id)}
                      aria-label={`Remove marker at ${formatTime(marker.time)}`}
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
