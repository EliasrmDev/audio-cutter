'use client'

/**
 * MobileSelectionLayer
 *
 * Two exported components for the mobile waveform selection experience:
 *
 *  • MobileSelectionLayer  — transparent overlay inside the waveform container,
 *    owns all touch interaction and renders large handle pills.
 *
 *  • MobileSelectionControls — accessible nudge-button strip rendered OUTSIDE
 *    the overflow container by WaveformEditor, so it is never clipped.
 *
 * Design decisions:
 *  • Handles are 48 px wide (vs 32 px desktop) for comfortable touch targets
 *  • Tooltips are always visible (not hover-dependent)
 *  • touch-action: none blocks scroll during active drags — acceptable trade-off
 *    for an audio selection UI
 *  • Nudge buttons provide 0.1 s precision without drag precision
 */

import React, { useCallback } from 'react'
import { useWaveformContext } from '@/contexts/WaveformContext'
import {
  useSelection,
  usePlayer,
  useAudioFile,
  useFixedDuration,
  useAudioStore,
} from '@/store/useAudioStore'
import { useMobileSelection } from './useMobileSelection'
import { useScrollWidth } from '../shared/useScrollWidth'
import { timeToPct } from '../shared/selectionUtils'
import { formatTime } from '@/lib/audioUtils'

/** Total hit-zone width around each handle */
const HANDLE_HIT_W  = 48   // px — fat touch targets
/** Visual pill width */
const HANDLE_PILL_W = 6    // px
/** Seconds moved per nudge button tap */
const NUDGE_STEP    = 0.1
/** Selection fill — matches the original WaveSurfer region colours */
const FILL_BG      = 'rgba(224, 123, 57, 0.25)'
const FILL_BORDER   = 'rgba(224, 123, 57, 0.8)'

// ── MobileSelectionLayer ──────────────────────────────────────────────────────

export function MobileSelectionLayer() {
  const { waveContainerRef, isReady, seekTo, zoom } = useWaveformContext()
  const selection     = useSelection()
  const player        = usePlayer()
  const audioFile     = useAudioFile()
  const fixedDuration = useFixedDuration()
  const duration      = player.duration || audioFile?.duration || 0
  const isFixed       = fixedDuration !== null

  const scrollWidth = useScrollWidth(waveContainerRef, isReady, zoom)

  const {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } = useMobileSelection({ containerRef: waveContainerRef, duration, isReady, seekTo })

  if (!isReady || duration <= 0) return null

  const startPct = selection ? timeToPct(selection.start, duration) : null
  const endPct   = selection ? timeToPct(selection.end,   duration) : null

  return (
    <div
      className="absolute inset-y-0 left-0 z-10"
      style={{
        width:           scrollWidth > 0 ? scrollWidth : '100%',
        // Prevents browser scroll/zoom during a drag gesture on this overlay.
        // The user can still scroll elsewhere on the page.
        touchAction:     'none',
        userSelect:      'none',
        WebkitUserSelect: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      aria-hidden="true"
    >
      {selection !== null && startPct !== null && endPct !== null && (
        <>
          {/*
           * ── Selection fill ──────────────────────────────────────────────
           * Rendered in the same React cycle as the handle pills.
           * This eliminates the 1-frame lag that WaveSurfer's useEffect-driven
           * region had during resize drags (region moved 1 paint after handles).
           */}
          <div
            className="absolute inset-y-0 pointer-events-none"
            style={{
              left:        `${startPct}%`,
              width:       `${endPct - startPct}%`,
              background:  FILL_BG,
              borderLeft:  `1px solid ${FILL_BORDER}`,
              borderRight: `1px solid ${FILL_BORDER}`,
            }}
          />

          <MobileHandle
            pct={startPct}
            side="left"
            isFixed={isFixed}
            time={selection.start}
          />
          <MobileHandle
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

// ── MobileSelectionControls ───────────────────────────────────────────────────

/**
 * Accessible nudge-button strip.
 * Rendered by WaveformEditor directly below the waveform div so it is never
 * clipped by the overflow-x-auto container.
 */
export function MobileSelectionControls() {
  const player    = usePlayer()
  const audioFile = useAudioFile()
  const selection = useSelection()
  const fixedDuration = useFixedDuration()
  const duration  = player.duration || audioFile?.duration || 0
  const isFixed   = fixedDuration !== null

  const nudgeStart = useCallback((delta: number) => {
    const {
      selection: sel,
      setSelection,
      fixedDuration: fd,
    } = useAudioStore.getState()
    if (!sel) return
    if (fd !== null) {
      // Fixed-duration mode: shift the whole window
      const newStart = Math.max(0, Math.min(duration - fd, sel.start + delta))
      setSelection({ start: newStart, end: newStart + fd, duration: fd })
    } else {
      const newStart = Math.max(0, Math.min(sel.end - 0.1, sel.start + delta))
      setSelection({ start: newStart, end: sel.end, duration: sel.end - newStart })
    }
  }, [duration])

  const nudgeEnd = useCallback((delta: number) => {
    const { selection: sel, setSelection, fixedDuration: fd } = useAudioStore.getState()
    if (!sel || fd !== null) return  // end is locked in fixed mode
    const newEnd = Math.max(sel.start + 0.1, Math.min(duration, sel.end + delta))
    setSelection({ start: sel.start, end: newEnd, duration: newEnd - sel.start })
  }, [duration])

  if (!selection) return null

  return (
    <div
      className="flex items-center justify-between px-2 py-1.5 border-t border-border bg-background-tertiary"
      role="group"
      aria-label="Ajustar selección"
    >
      {/* ── Start nudge ── */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center rounded border border-border
                     text-foreground-secondary active:bg-primary/20 text-sm leading-none"
          onClick={() => nudgeStart(-NUDGE_STEP)}
          aria-label="Mover inicio hacia atrás 0.1 s"
        >
          ←
        </button>
        <span className="font-mono tabular-nums text-primary text-xs min-w-[44px] text-center">
          {formatTime(selection.start)}
        </span>
        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center rounded border border-border
                     text-foreground-secondary active:bg-primary/20 text-sm leading-none"
          onClick={() => nudgeStart(NUDGE_STEP)}
          aria-label="Mover inicio hacia adelante 0.1 s"
        >
          →
        </button>
      </div>

      {/* ── Duration ── */}
      <span className="text-foreground-muted text-xs tabular-nums">
        {formatTime(selection.duration)}
      </span>

      {/* ── End nudge — hidden in fixed-duration mode ── */}
      {!isFixed ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded border border-border
                       text-foreground-secondary active:bg-primary/20 text-sm leading-none"
            onClick={() => nudgeEnd(-NUDGE_STEP)}
            aria-label="Mover fin hacia atrás 0.1 s"
          >
            ←
          </button>
          <span className="font-mono tabular-nums text-primary text-xs min-w-[44px] text-center">
            {formatTime(selection.end)}
          </span>
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded border border-border
                       text-foreground-secondary active:bg-primary/20 text-sm leading-none"
            onClick={() => nudgeEnd(NUDGE_STEP)}
            aria-label="Mover fin hacia adelante 0.1 s"
          >
            →
          </button>
        </div>
      ) : (
        /* Spacer to keep duration centred */
        <div className="w-[100px]" aria-hidden="true" />
      )}
    </div>
  )
}

// ── Handle sub-component ──────────────────────────────────────────────────────

interface MobileHandleProps {
  pct:     number
  side:    'left' | 'right'
  isFixed: boolean
  time:    number
}

function MobileHandle({ pct, side, isFixed, time }: MobileHandleProps) {
  void isFixed // both modes show handles on mobile

  return (
    <div
      className="absolute inset-y-0 flex items-center justify-center"
      style={{
        left:          `calc(${pct}% - ${HANDLE_HIT_W / 2}px)`,
        width:         HANDLE_HIT_W,
        pointerEvents: 'none',
        zIndex:        2,
      }}
    >
      {/* Larger visible pill for touch — always shown */}
      <div
        className="h-2/3 rounded-full bg-primary shadow-lg"
        style={{ width: HANDLE_PILL_W }}
      />

      {/* Always-visible time tooltip (touch has no hover state) */}
      <div
        className={[
          'absolute pointer-events-none',
          'px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums',
          'bg-background/90 border border-border text-foreground-secondary',
          'whitespace-nowrap shadow-sm',
          side === 'left' ? 'bottom-1 left-full ml-1' : 'bottom-1 right-full mr-1',
        ].join(' ')}
      >
        {formatTime(time)}
      </div>
    </div>
  )
}
