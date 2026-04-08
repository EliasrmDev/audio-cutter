'use client'

/**
 * MobileSelectionLayer
 *
 * Two exported components for the mobile waveform selection experience:
 *
 *  • MobileSelectionLayer  — transparent overlay inside the waveform container.
 *    Coordinates single-finger selection with two-finger pinch zoom.
 *    Interaction priority: resize > move > create > zoom.
 *    When a second finger lands, any active selection drag is cancelled and
 *    pinch zoom takes over; when fingers return to one, the user must re-touch
 *    to start a new selection (matches native DAW behaviour).
 *
 *  • MobileSelectionControls — accessible controls rendered OUTSIDE the overflow
 *    container by WaveformEditor, so they are never clipped. Contains nudge
 *    buttons for ±0.1 s precision and zoom +/− buttons as accessible alternative
 *    to the pinch gesture.
 *
 * Design decisions:
 *  • touch-action: none blocks all browser gestures on the overlay (scroll,
 *    pinch-zoom) — the overlay owns every touch interaction.
 *  • Handle hit zones are 48 px wide (vs 32 px desktop) for fat-finger accuracy.
 *  • Tooltips are always visible (no hover state on touch).
 *  • rAF throttling inside usePinchZoom prevents layout jitter during fast pinch.
 */

import React, { useCallback, useRef } from 'react'
import { useWaveformContext } from '@/contexts/WaveformContext'
import {
  useSelection,
  usePlayer,
  useAudioFile,
  useFixedDuration,
  useAudioStore,
} from '@/store/useAudioStore'
import { useMobileSelection } from './useMobileSelection'
import { usePinchZoom } from './usePinchZoom'
import { useScrollWidth } from '../shared/useScrollWidth'
import { timeToPct } from '../shared/selectionUtils'
import { formatTime } from '@/lib/audioUtils'
import { ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX } from '../shared/zoomUtils'

/** Total hit-zone width around each handle */
const HANDLE_HIT_W  = 48   // px — fat touch targets
/** Visual pill width */
const HANDLE_PILL_W = 6    // px
/** Seconds moved per nudge button tap */
const NUDGE_STEP    = 0.1
/** Zoom step for the accessible +/− buttons */
const ZOOM_STEP     = 20
/** Selection fill — matches the original WaveSurfer region colours */
const FILL_BG      = 'rgba(224, 123, 57, 0.25)'
const FILL_BORDER   = 'rgba(224, 123, 57, 0.8)'

// ── MobileSelectionLayer ──────────────────────────────────────────────────────

export function MobileSelectionLayer() {
  const { waveContainerRef, isReady, seekTo, zoom, setZoom } = useWaveformContext()
  const selection     = useSelection()
  const player        = usePlayer()
  const audioFile     = useAudioFile()
  const fixedDuration = useFixedDuration()
  const duration      = player.duration || audioFile?.duration || 0
  const isFixed       = fixedDuration !== null

  const scrollWidth = useScrollWidth(waveContainerRef, isReady, zoom)

  // ── Selection (single-finger) ─────────────────────────────────────────────

  const {
    onPointerDown:   selDown,
    onPointerMove:   selMove,
    onPointerUp:     selUp,
    onPointerCancel: selCancel,
    cancelDrag,
  } = useMobileSelection({ containerRef: waveContainerRef, duration, isReady, seekTo })

  // ── Pinch zoom (two-finger) ───────────────────────────────────────────────

  const {
    isPinchingRef,
    onPointerDown:   pinchDown,
    onPointerMove:   pinchMove,
    onPointerUp:     pinchUp,
    onPointerCancel: pinchCancel,
  } = usePinchZoom({
    containerRef: waveContainerRef,
    zoom,
    setZoom,
    onPinchStateChange: (pinching) => {
      // Cancel any in-progress selection drag the moment the second finger lands.
      if (pinching) cancelDrag()
    },
  })

  // ── Unified pointer handlers ──────────────────────────────────────────────
  //
  // All touch pointers flow through both hooks; each hook filters by role:
  //   • usePinchZoom — always tracks pointer registry (needs count for activation)
  //   • useMobileSelection — only acts when NOT pinching
  //
  // isPinchingRef.current is set synchronously inside pinchDown, so it is
  // accurate immediately after pinchDown(e) returns.

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    pinchDown(e)
    // Do not start a selection drag if a pinch is now active
    if (!isPinchingRef.current) selDown(e)
  }, [pinchDown, selDown, isPinchingRef])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    pinchMove(e)
    if (!isPinchingRef.current) selMove(e)
  }, [pinchMove, selMove, isPinchingRef])

  // Capture pinch state before removePointer clears it
  const wasPinchingRef = useRef(false)

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    wasPinchingRef.current = isPinchingRef.current
    pinchUp(e)
    // Only commit selection if this pointer was part of a selection drag
    if (!wasPinchingRef.current) selUp(e)
  }, [pinchUp, selUp, isPinchingRef])

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => {
    pinchCancel(e)
    selCancel(e)  // always cancel selection on browser-initiated cancel
  }, [pinchCancel, selCancel])

  // ─────────────────────────────────────────────────────────────────────────

  if (!isReady || duration <= 0) return null

  const startPct = selection ? timeToPct(selection.start, duration) : null
  const endPct   = selection ? timeToPct(selection.end,   duration) : null

  return (
    <div
      className="absolute inset-y-0 left-0 z-10"
      style={{
        width:            scrollWidth > 0 ? scrollWidth : '100%',
        // touch-action: none is critical — it prevents the browser from
        // intercepting pinch-zoom and scroll gestures on this overlay.
        touchAction:      'none',
        userSelect:       'none',
        WebkitUserSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      aria-hidden="true"
    >
      {selection !== null && startPct !== null && endPct !== null && (
        <>
          {/* ── Selection fill ────────────────────────────────────────── */}
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
 * Accessible control strip rendered by WaveformEditor directly below the
 * waveform div so it is never clipped by the overflow-x-auto container.
 *
 * Renders two rows:
 *  1. Selection nudge buttons (± start / end) — only when a selection exists
 *  2. Zoom buttons (− / level / +) — always visible when waveform is ready
 */
export function MobileSelectionControls() {
  const { zoom, setZoom, isReady } = useWaveformContext()
  const player    = usePlayer()
  const audioFile = useAudioFile()
  const selection = useSelection()
  const fixedDuration = useFixedDuration()
  const duration  = player.duration || audioFile?.duration || 0
  const isFixed   = fixedDuration !== null

  // ── Selection nudge ───────────────────────────────────────────────────────

  const nudgeStart = useCallback((delta: number) => {
    const {
      selection: sel,
      setSelection,
      fixedDuration: fd,
    } = useAudioStore.getState()
    if (!sel) return
    if (fd !== null) {
      const newStart = Math.max(0, Math.min(duration - fd, sel.start + delta))
      setSelection({ start: newStart, end: newStart + fd, duration: fd })
    } else {
      const newStart = Math.max(0, Math.min(sel.end - 0.1, sel.start + delta))
      setSelection({ start: newStart, end: sel.end, duration: sel.end - newStart })
    }
  }, [duration])

  const nudgeEnd = useCallback((delta: number) => {
    const { selection: sel, setSelection, fixedDuration: fd } = useAudioStore.getState()
    if (!sel || fd !== null) return
    const newEnd = Math.max(sel.start + 0.1, Math.min(duration, sel.end + delta))
    setSelection({ start: sel.start, end: newEnd, duration: newEnd - sel.start })
  }, [duration])

  // ── Zoom helpers ──────────────────────────────────────────────────────────

  const canZoomIn  = zoom < ZOOM_MAX
  const canZoomOut = zoom > ZOOM_MIN

  // ─────────────────────────────────────────────────────────────────────────

  // Always render at least the zoom bar once the waveform is ready
  if (!isReady) return null

  return (
    <div className="border-t border-border bg-background-tertiary divide-y divide-border">

      {/* ── Nudge row (selection only) ────────────────────────────────── */}
      {selection && (
        <div
          className="flex items-center justify-between px-2 py-1.5"
          role="group"
          aria-label="Ajustar selección"
        >
          {/* Start nudge */}
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

          {/* Duration */}
          <span className="text-foreground-muted text-xs tabular-nums">
            {formatTime(selection.duration)}
          </span>

          {/* End nudge — hidden in fixed-duration mode */}
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
            <div className="w-[100px]" aria-hidden="true" />
          )}
        </div>
      )}

      {/* ── Zoom row (always visible) ─────────────────────────────────── */}
      <div
        className="flex items-center justify-center gap-3 px-3 py-1.5"
        role="group"
        aria-label="Zoom del waveform"
      >
        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center rounded border border-border
                     text-foreground-secondary text-base leading-none
                     active:bg-primary/20 disabled:opacity-30"
          onClick={() => setZoom(zoom - ZOOM_STEP)}
          disabled={!canZoomOut}
          aria-label="Reducir zoom"
        >
          −
        </button>

        {/* Current zoom level + reset button */}
        <button
          type="button"
          className="font-mono tabular-nums text-foreground-muted text-xs min-w-[52px] text-center
                     hover:text-primary active:text-primary transition-colors"
          onClick={() => setZoom(ZOOM_DEFAULT)}
          aria-label={`Zoom: ${zoom} px/s. Toca para restablecer`}
          title="Restablecer zoom"
        >
          {zoom} px/s
        </button>

        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center rounded border border-border
                     text-foreground-secondary text-base leading-none
                     active:bg-primary/20 disabled:opacity-30"
          onClick={() => setZoom(zoom + ZOOM_STEP)}
          disabled={!canZoomIn}
          aria-label="Aumentar zoom"
        >
          +
        </button>
      </div>

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

function MobileHandle({ pct, side, time }: MobileHandleProps) {
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
