'use client'

/**
 * WaveformSelectionOverlay
 *
 * Transparent div that sits on top of the WaveSurfer canvas and owns
 * ALL pointer interaction for creating, moving, and resizing the selection.
 *
 * Visual layers (bottom → top):
 *   1. WaveSurfer canvas (the waveform)
 *   2. WaveSurfer region div (orange fill + border — managed by useAudioSelection)
 *   3. This overlay (transparent, full-content-width, captures events)
 *      └─ Handle bars at selection.start and selection.end (visual pill + hit zone)
 *
 * Width is synced to the waveform's scrollWidth so handles are always at
 * the correct position even after zooming.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useWaveformContext } from '@/contexts/WaveformContext'
import { useSelection, usePlayer, useAudioFile, useAudioStore } from '@/store/useAudioStore'
import {
  useSelectionPointer,
} from '@/hooks/useSelectionPointer'
import { formatTime } from '@/lib/audioUtils'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Total width of the invisible pointer hit zone around each handle */
const HANDLE_HIT_W = 32   // px  (≥ 24 px minimum for mobile)
/** Visual pill width */
const HANDLE_PILL_W = 5   // px

// ── Component ─────────────────────────────────────────────────────────────────

export function WaveformSelectionOverlay() {
  const { waveContainerRef, isReady, seekTo, zoom } = useWaveformContext()
  const selection  = useSelection()
  const player     = usePlayer()
  const audioFile  = useAudioFile()
  const overlayRef = useRef<HTMLDivElement>(null)

  const duration = player.duration || audioFile?.duration || 0

  // ── Track scroll-content width (changes with zoom) ────────────────────
  const [scrollWidth, setScrollWidth] = useState(0)

  useEffect(() => {
    const c = waveContainerRef.current
    if (!c || !isReady) return

    const update = () => {
      // scrollWidth = WaveSurfer inner canvas width
      setScrollWidth(c.scrollWidth)
    }
    update()

    // ResizeObserver fires when the inner canvas changes width (zoom)
    const ro = new ResizeObserver(update)
    ro.observe(c)
    // Also observe first child (WaveSurfer wrapper) if it exists
    if (c.firstElementChild) ro.observe(c.firstElementChild)
    return () => ro.disconnect()
  }, [waveContainerRef, isReady, zoom])   // re-run if zoom changes too

  // ── Pointer interaction ───────────────────────────────────────────────

  const { dragTypeRef, onPointerDown, getCursor } = useSelectionPointer({
    containerRef: waveContainerRef,
    duration,
    isReady,
    seekTo,
  })

  const [cursor, setCursor] = useState<string>('crosshair')

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setCursor(getCursor(e.clientX))
  }, [getCursor])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    onPointerDown(e)
    setCursor(getCursor(e.clientX))
  }, [onPointerDown, getCursor])

  const handlePointerLeave = useCallback(() => {
    if (!dragTypeRef.current) setCursor('crosshair')
  }, [dragTypeRef])

  // ── Render ────────────────────────────────────────────────────────────

  if (!isReady || duration <= 0) return null

  // Positions as percentage of total scroll width
  const startPct = selection ? (selection.start / duration) * 100 : null
  const endPct   = selection ? (selection.end   / duration) * 100 : null
  const isFixed  = useAudioStore.getState().fixedDuration !== null

  return (
    <div
      ref={overlayRef}
      className="absolute inset-y-0 left-0 z-10"
      style={{
        width:        scrollWidth > 0 ? scrollWidth : '100%',
        cursor,
        touchAction:  'none',
        userSelect:   'none',
        WebkitUserSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      // a11y: the overlay is purely interactive chrome; the time inputs
      // in AudioCutter provide the accessible control surface.
      aria-hidden="true"
    >
      {selection !== null && startPct !== null && endPct !== null && (
        <>
          {/* ── Left handle ── */}
          <Handle
            pct={startPct}
            side="left"
            isFixed={isFixed}
            time={selection.start}
          />

          {/* ── Right handle ── */}
          <Handle
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

interface HandleProps {
  pct:     number
  side:    'left' | 'right'
  isFixed: boolean
  time:    number
}

function Handle({ pct, side, isFixed, time }: HandleProps) {
  const offset = side === 'left'
    ? -(HANDLE_HIT_W / 2)
    : -(HANDLE_HIT_W / 2)

  return (
    <div
      className="absolute inset-y-0 flex items-center justify-center"
      style={{
        left:        `calc(${pct}% + ${offset}px)`,
        width:       HANDLE_HIT_W,
        cursor:      isFixed ? 'grab' : 'ew-resize',
        pointerEvents: 'none',  // overlay parent already captures events
        zIndex:      2,
      }}
    >
      {/* Visual pill — only shown when not in fixed mode (handles imply free resize) */}
      {!isFixed && (
        <div
          className="h-3/5 rounded-full bg-primary shadow-md"
          style={{ width: HANDLE_PILL_W }}
        />
      )}

      {/* Time tooltip label — visible on hover via CSS group (parent hover) */}
      <div
        className={clsx(
          'absolute pointer-events-none',
          'px-1 py-0.5 rounded text-[9px] font-mono tabular-nums',
          'bg-background border border-border text-foreground-secondary',
          'whitespace-nowrap shadow-sm',
          side === 'left'  ? 'top-1 left-full ml-1' : 'top-1 right-full mr-1'
        )}
        style={{ opacity: 0.85 }}
      >
        {formatTime(time)}
      </div>
    </div>
  )
}
