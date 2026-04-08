'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useWaveformContext } from '@/contexts/WaveformContext'
import { useAudioSelection } from '@/hooks/useAudioSelection'
import { usePlayer, useAudioFile, useSelection, useSelectionMode, useFixedDuration, useAudioStore } from '@/store/useAudioStore'
import { formatTime } from '@/lib/audioUtils'
import { DurationSelector } from './DurationSelector'
import { DesktopSelectionLayer } from './waveform/desktop/DesktopSelectionLayer'
import { MobileSelectionLayer, MobileSelectionControls } from './waveform/mobile/MobileSelectionLayer'
import { clampZoom, scrollAfterZoom, ZOOM_DEFAULT } from './waveform/shared/zoomUtils'
import type { BaseComponentProps } from '@/types/audio'

export interface WaveformEditorProps extends BaseComponentProps {
  /** Height of the waveform canvas in pixels */
  height?: number
}

const ZOOM_STEP             = 20
const ZOOM_WHEEL_SENSITIVITY = 2.5

/**
 * Renders the WaveSurfer waveform canvas and timeline.
 * Must be rendered inside a <WaveformProvider>.
 */
export function WaveformEditor({
  className,
  height = 130,
  'aria-label': ariaLabel = 'Audio waveform editor',
}: WaveformEditorProps) {
  const {
    waveContainerRef,
    timelineContainerRef,
    regionsPlugin,
    isReady,
    zoom,
    setZoom,
    play,
    pause,
    seekTo,
  } = useWaveformContext()

  // Pending rAF for scroll-centering after zoom — cancelled on rapid events
  const wheelRafRef = useRef<number | null>(null)

  const audioFile = useAudioFile()
  const player = usePlayer()
  const selection = useSelection()
  const selectionMode = useSelectionMode()
  const fixedDuration = useFixedDuration()
  const duration = player.duration || audioFile?.duration || 0

  // ── Device detection ──────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const { clearSelection, shiftWindow } = useAudioSelection({
    regionsPlugin,
    isWaveformReady: isReady,
    duration,
    fixedDuration,
  })

  // ── Zoom helper — centers zoom on the visible viewport midpoint ───────────
  const applyKeyboardZoom = useCallback((newZoom: number) => {
    const clamped   = clampZoom(newZoom)
    const container = waveContainerRef.current
    if (!container || clamped === zoom) { setZoom(clamped); return }

    const oldScrollLeft = container.scrollLeft
    const oldZoom       = zoom
    const rect          = container.getBoundingClientRect()
    // Center on the visible midpoint so the user doesn't lose their place
    const anchorX       = rect.left + rect.width / 2

    setZoom(clamped)

    // Adjust scroll after WaveSurfer re-renders the canvas at the new width.
    // rAF fires after layout so scrollWidth is already updated.
    if (wheelRafRef.current !== null) cancelAnimationFrame(wheelRafRef.current)
    wheelRafRef.current = requestAnimationFrame(() => {
      wheelRafRef.current = null
      scrollAfterZoom(container, anchorX, oldScrollLeft, oldZoom, clamped)
    })
  }, [zoom, setZoom, waveContainerRef])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (player.isPlaying) pause()
          else play()
          break

        case 'ArrowLeft': {
          e.preventDefault()
          const state = useAudioStore.getState()
          const { selectionMode: mode, selection: sel } = state
          if (mode === 'fixed') {
            shiftWindow(e.shiftKey ? -0.5 : -1)
          } else if (sel) {
            if (e.shiftKey) {
              const newStart = Math.max(0, sel.start - 0.1)
              state.setSelection({ start: newStart, end: sel.end, duration: sel.end - newStart })
            } else {
              const len = sel.end - sel.start
              const newStart = Math.max(0, sel.start - 1)
              state.setSelection({ start: newStart, end: newStart + len, duration: len })
            }
          } else {
            seekTo(Math.max(0, player.currentTime - (e.shiftKey ? 0.1 : 5)))
          }
          break
        }

        case 'ArrowRight': {
          e.preventDefault()
          const state = useAudioStore.getState()
          const { selectionMode: mode, selection: sel } = state
          if (mode === 'fixed') {
            shiftWindow(e.shiftKey ? 0.5 : 1)
          } else if (sel) {
            if (e.shiftKey) {
              const newEnd = Math.min(duration, sel.end + 0.1)
              state.setSelection({ start: sel.start, end: newEnd, duration: newEnd - sel.start })
            } else {
              const len = sel.end - sel.start
              const newStart = Math.min(duration - len, sel.start + 1)
              state.setSelection({ start: newStart, end: newStart + len, duration: len })
            }
          } else {
            seekTo(Math.min(duration, player.currentTime + (e.shiftKey ? 0.1 : 5)))
          }
          break
        }

        // Zoom in — only without Ctrl/Meta (let browser handle Ctrl+= natively)
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          applyKeyboardZoom(zoom + ZOOM_STEP)
          break

        // Zoom out — only without Ctrl/Meta (let browser handle Ctrl+- natively)
        case '-':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          applyKeyboardZoom(zoom - ZOOM_STEP)
          break

        // Reset zoom to default
        case '0':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            applyKeyboardZoom(ZOOM_DEFAULT)
          }
          break

        case 'Escape':
          clearSelection()
          break

        case 'm':
        case 'M':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('waveform:addmarker'))
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [player.isPlaying, player.currentTime, duration, zoom, play, pause, seekTo, applyKeyboardZoom, clearSelection, shiftWindow])

  // ── Ctrl + scroll → zoom centred on cursor ────────────────────────────
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      const delta    = (-e.deltaY > 0 ? ZOOM_WHEEL_SENSITIVITY : -ZOOM_WHEEL_SENSITIVITY) * 10
      const newZoom  = clampZoom(zoom + delta)
      if (newZoom === zoom) return

      const container = waveContainerRef.current
      if (!container) { setZoom(newZoom); return }

      const anchorX       = e.clientX
      const oldScrollLeft = container.scrollLeft
      const oldZoom       = zoom

      setZoom(newZoom)

      // Adjust scroll after WaveSurfer redraws at the new zoom level.
      // Cancel any pending adjustment from a prior wheel event.
      if (wheelRafRef.current !== null) cancelAnimationFrame(wheelRafRef.current)
      wheelRafRef.current = requestAnimationFrame(() => {
        wheelRafRef.current = null
        scrollAfterZoom(container, anchorX, oldScrollLeft, oldZoom, newZoom)
      })
    },
    [zoom, setZoom, waveContainerRef]
  )

  if (!audioFile) return null

  return (
    <div
      className={clsx(
        'relative flex flex-col rounded-lg overflow-hidden border border-border bg-background-secondary',
        className
      )}
      role="region"
      aria-label={ariaLabel}
    >
      {/* ── Info bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-background-tertiary">
        <div className="flex items-center gap-2 text-xs text-foreground-muted font-mono tabular-nums">
          <span aria-label="Current time">{formatTime(player.currentTime)}</span>
          <span aria-hidden="true">/</span>
          <span aria-label="Total duration">{formatTime(duration)}</span>
        </div>

        {selection && (
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
            <span className="text-primary" aria-label="Selection range">
              {formatTime(selection.start)} — {formatTime(selection.end)}
            </span>
            <span className="text-foreground-muted">({formatTime(selection.duration)})</span>
          </div>
        )}

        <span className="text-[11px] text-foreground-muted tabular-nums"
          aria-label={`Zoom: ${zoom}px per second`}>
          {zoom} px/s
        </span>
      </div>

      {/* ── Duration selector toolbar ────────────────────────────── */}
      {isReady && (
        <div className="flex items-center px-3 py-1.5 border-b border-border bg-background-tertiary">
          <DurationSelector />
        </div>
      )}

      {/* ── Loading indicator ─────────────────────────────────────── */}
      {!isReady && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background-secondary/90 pointer-events-none"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-2 text-foreground-secondary text-sm">
            <svg className="animate-spin h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Rendering waveform…
          </div>
        </div>
      )}

      {/* ── WaveSurfer canvas ─────────────────────────────────────── */}
      <div
        ref={waveContainerRef}
        className={clsx(
          'relative w-full overflow-x-auto wavesurfer-container',
          'transition-opacity duration-300',
          !isReady && 'opacity-0'
        )}
        style={{ height, minHeight: height }}
        onWheel={handleWheel}
        aria-hidden="true"
      >
        {isMobile ? <MobileSelectionLayer /> : <DesktopSelectionLayer />}
      </div>

      {/* ── Mobile accessible selection controls ─────────────────── */}
      {isMobile && <MobileSelectionControls />}

      {/* ── Timeline ─────────────────────────────────────────────── */}
      <div
        ref={timelineContainerRef}
        className={clsx(
          'w-full border-t border-border bg-background-secondary transition-opacity duration-300',
          !isReady && 'opacity-0'
        )}
        style={{ height: 24 }}
        aria-hidden="true"
      />

      {/* ── Keyboard shortcuts bar (hidden on mobile) ─────────────── */}
      <div
        className="hidden sm:flex items-center flex-wrap gap-x-4 gap-y-1 px-3 py-1.5 border-t border-border bg-background-tertiary"
        aria-label="Keyboard shortcuts"
      >
        {(
          [
            ['Space', 'Play / Pause'],
            ['← →', selectionMode === 'fixed' ? 'Move window ±1 s' : selection ? 'Move selection ±1 s' : '±5 s'],
            ['⇧ ← →', selectionMode === 'fixed' ? 'Move window ±0.5 s' : selection ? 'Resize endpoints ±0.1 s' : '±0.1 s'],
            ['+ −', 'Zoom waveform'],
            ['0', 'Reset zoom'],
            ['Ctrl + scroll', 'Zoom on cursor'],
            ['M', 'Add marker'],
            ['Esc', 'Clear selection'],
          ] as [string, string][]
        ).map(([key, desc]) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-foreground-muted">
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-background font-mono text-[10px] text-foreground-secondary leading-none">
              {key}
            </kbd>
            <span>{desc}</span>
          </span>
        ))}
      </div>

    </div>
  )
}
