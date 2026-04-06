'use client'

/**
 * DesktopSelectionLayer
 *
 * Transparent absolute overlay that sits on top of the WaveSurfer canvas.
 * Handles all mouse interaction for creating, moving, and resizing the selection.
 *
 * Visual elements:
 *  • Thin 5 px pill at each handle position (free-selection mode)
 *  • Time tooltip next to each handle
 *  • Dynamic cursor (crosshair / grab / grabbing / ew-resize)
 *
 * This component renders null on coarse-pointer (touch) devices — the
 * MobileSelectionLayer handles those instead.
 */

import React from 'react'
import { clsx } from 'clsx'
import { useWaveformContext } from '@/contexts/WaveformContext'
import { useSelection, usePlayer, useAudioFile, useFixedDuration } from '@/store/useAudioStore'
import { useDesktopSelection } from './useDesktopSelection'
import { useScrollWidth } from '../shared/useScrollWidth'
import { timeToPct } from '../shared/selectionUtils'
import { formatTime } from '@/lib/audioUtils'

/** Visual pill width */
const HANDLE_PILL_W = 5    // px
/** Total invisible hit-zone width around each handle */
const HANDLE_HIT_W  = 32   // px

export function DesktopSelectionLayer() {
  const { waveContainerRef, isReady, seekTo, zoom } = useWaveformContext()
  const selection     = useSelection()
  const player        = usePlayer()
  const audioFile     = useAudioFile()
  const fixedDuration = useFixedDuration()
  const duration      = player.duration || audioFile?.duration || 0
  const isFixed       = fixedDuration !== null

  const scrollWidth = useScrollWidth(waveContainerRef, isReady, zoom)

  const {
    cursor,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
  } = useDesktopSelection({ containerRef: waveContainerRef, duration, isReady, seekTo })

  if (!isReady || duration <= 0) return null

  const startPct = selection ? timeToPct(selection.start, duration) : null
  const endPct   = selection ? timeToPct(selection.end,   duration) : null

  return (
    <div
      className="absolute inset-y-0 left-0 z-10"
      style={{
        width:           scrollWidth > 0 ? scrollWidth : '100%',
        cursor,
        touchAction:     'auto',
        userSelect:      'none',
        WebkitUserSelect: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      // Purely interactive chrome — accessible control surface is the time
      // inputs in AudioCutter plus keyboard shortcuts in WaveformEditor.
      aria-hidden="true"
    >
      {selection !== null && startPct !== null && endPct !== null && (
        <>
          <DesktopHandle
            pct={startPct}
            side="left"
            isFixed={isFixed}
            time={selection.start}
          />
          <DesktopHandle
            pct={endPct}
            side="right"
            isFixed={isFixed}
            time={selection.end}
          />
        </>
      )}
    </div>
  )
}

// ── Handle sub-component ──────────────────────────────────────────────────────

interface DesktopHandleProps {
  pct:     number
  side:    'left' | 'right'
  isFixed: boolean
  time:    number
}

function DesktopHandle({ pct, side, isFixed, time }: DesktopHandleProps) {
  return (
    <div
      className="absolute inset-y-0 flex items-center justify-center"
      style={{
        left:          `calc(${pct}% - ${HANDLE_HIT_W / 2}px)`,
        width:         HANDLE_HIT_W,
        cursor:        isFixed ? 'grab' : 'ew-resize',
        pointerEvents: 'none',  // parent overlay already owns all events
        zIndex:        2,
      }}
    >
      {/* Visible pill — hidden in fixed-duration mode (no resize affordance) */}
      {!isFixed && (
        <div
          className="h-3/5 rounded-full bg-primary shadow-md"
          style={{ width: HANDLE_PILL_W }}
        />
      )}

      {/* Timestamp tooltip */}
      <div
        className={clsx(
          'absolute pointer-events-none',
          'px-1 py-0.5 rounded text-[9px] font-mono tabular-nums',
          'bg-background border border-border text-foreground-secondary',
          'whitespace-nowrap shadow-sm',
          side === 'left' ? 'top-1 left-full ml-1' : 'top-1 right-full mr-1',
        )}
        style={{ opacity: 0.85 }}
      >
        {formatTime(time)}
      </div>
    </div>
  )
}
