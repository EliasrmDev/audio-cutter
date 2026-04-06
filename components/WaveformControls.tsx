'use client'

import React, { useCallback, useRef } from 'react'
import {
  Play, Pause, SkipBack, SkipForward,
  ZoomIn, ZoomOut, Volume2, VolumeX, X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useWaveformContext } from '@/contexts/WaveformContext'
import { useAudioStore, usePlayer, useSelection } from '@/store/useAudioStore'
import { Button, Slider } from '@/components/ui'
import { formatTime } from '@/lib/audioUtils'
import type { BaseComponentProps } from '@/types/audio'

export interface WaveformControlsProps extends BaseComponentProps {}

const ZOOM_STEP = 20
const SEEK_STEP = 5

export function WaveformControls({ className, 'aria-label': ariaLabel = 'Waveform controls' }: WaveformControlsProps) {
  const { isReady, zoom, setZoom, play, pause, togglePlayPause, seekTo, wavesurfer } = useWaveformContext()

  const player = usePlayer()
  const selection = useSelection()
  const { setVolume, setMuted, setSelection } = useAudioStore()

  const duration = player.duration
  const isDisabled = !isReady

  // ── Playback ──────────────────────────────────────────────────────────

  const handleSeekBack = useCallback(() => {
    seekTo(Math.max(0, player.currentTime - SEEK_STEP))
  }, [seekTo, player.currentTime])

  const handleSeekForward = useCallback(() => {
    seekTo(Math.min(duration, player.currentTime + SEEK_STEP))
  }, [seekTo, player.currentTime, duration])

  // ── Volume ────────────────────────────────────────────────────────────

  const handleVolumeChange = useCallback((value: number) => {
    setVolume(value)
    if (player.muted && value > 0) setMuted(false)
  }, [setVolume, setMuted, player.muted])

  const handleMuteToggle = useCallback(() => {
    setMuted(!player.muted)
  }, [setMuted, player.muted])

  // ── Zoom ──────────────────────────────────────────────────────────────

  const handleZoomIn = useCallback(() => setZoom(zoom + ZOOM_STEP), [setZoom, zoom])
  const handleZoomOut = useCallback(() => setZoom(zoom - ZOOM_STEP), [setZoom, zoom])

  const handleZoomSliderChange = useCallback(
    (value: number) => setZoom(value),
    [setZoom]
  )

  // Ref that holds the cleanup fn for the active selection-preview listener
  const selectionStopRef = useRef<(() => void) | null>(null)

  // ── Selection ────────────────────────────────────

  const handleClearSelection = useCallback(() => setSelection(null), [setSelection])

  const handlePlaySelection = useCallback(() => {
    const ws = wavesurfer.current
    if (!ws) return
    const { selection: sel } = useAudioStore.getState()
    if (!sel) return

    // Clean up any previous stop-listener
    selectionStopRef.current?.()
    selectionStopRef.current = null

    // WaveSurfer v7: play(start, end) seeks and plays the range atomically
    ws.play(sel.start, sel.end)
  }, [wavesurfer])

  return (
    <div
      className={clsx(
        'flex flex-col gap-2 px-3 py-2.5 bg-background-secondary border border-border rounded-lg',
        className
      )}
      role="toolbar"
      aria-label={ariaLabel}
    >
      {/* ══════════════════════════════════════════════════════════════════
          MOBILE  (< md): three stacked rows
          DESKTOP (≥ md): one compact row
      ══════════════════════════════════════════════════════════════════ */}

      {/* ── Mobile row 1: Time + Volume ───────────────────────────────── */}
      <div className="flex items-center justify-between md:hidden">
        <div
          className="font-mono text-xs tabular-nums text-foreground-secondary"
          aria-live="polite"
          aria-atomic="true"
        >
          <span aria-label="Current time">{formatTime(player.currentTime)}</span>
          <span className="text-foreground-muted mx-1" aria-hidden="true">/</span>
          <span aria-label="Total duration">{formatTime(duration)}</span>
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label="Volume">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleMuteToggle}
            aria-label={player.muted ? 'Unmute' : 'Mute'}
          >
            {player.muted || player.volume === 0
              ? <VolumeX size={16} aria-hidden="true" />
              : <Volume2 size={16} aria-hidden="true" />}
          </Button>
          <Slider
            value={player.muted ? 0 : player.volume}
            min={0} max={1} step={0.02}
            onChange={handleVolumeChange}
            className="w-20"
            aria-label="Volume"
          />
          <span className="text-xs text-foreground-muted tabular-nums w-7 text-right ml-2">
            {Math.round((player.muted ? 0 : player.volume) * 100)}%
          </span>
        </div>
      </div>

      {/* ── Mobile row 2: Large centred playback ─────────────────────── */}
      <div
        className="flex items-center justify-center gap-3 md:hidden"
        role="group"
        aria-label="Playback"
      >
        <Button
          size="sm"
          variant="ghost"
          onClick={handleSeekBack}
          disabled={isDisabled}
          aria-label={`Seek back ${SEEK_STEP} seconds`}
          className="w-10 h-10"
        >
          <SkipBack size={18} aria-hidden="true" />
        </Button>

        <Button
          variant="primary"
          onClick={togglePlayPause}
          disabled={isDisabled}
          aria-label={player.isPlaying ? 'Pause' : 'Play'}
          className="w-12 h-12"
        >
          {player.isPlaying
            ? <Pause size={22} aria-hidden="true" />
            : <Play  size={22} aria-hidden="true" />}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={handleSeekForward}
          disabled={isDisabled}
          aria-label={`Seek forward ${SEEK_STEP} seconds`}
          className="w-10 h-10"
        >
          <SkipForward size={18} aria-hidden="true" />
        </Button>
      </div>

      {/* ── Mobile row 3: Zoom strip ──────────────────────────────────── */}
      <div className="flex items-center gap-2 md:hidden" role="group" aria-label="Zoom">
        <Button
          size="sm" variant="ghost"
          onClick={handleZoomOut}
          disabled={isDisabled || zoom <= 10}
          aria-label="Zoom out"
        >
          <ZoomOut size={15} aria-hidden="true" />
        </Button>

        <Slider
          value={zoom} min={10} max={500} step={10}
          onChange={handleZoomSliderChange}
          className="flex-1"
          aria-label="Zoom level"
          disabled={isDisabled}
        />

        <Button
          size="sm" variant="ghost"
          onClick={handleZoomIn}
          disabled={isDisabled || zoom >= 500}
          aria-label="Zoom in"
        >
          <ZoomIn size={15} aria-hidden="true" />
        </Button>

        <span
          className="text-[11px] text-foreground-muted tabular-nums w-12 text-right shrink-0"
          aria-label={`Zoom: ${zoom} pixels per second`}
        >
          {zoom} px/s
        </span>
      </div>

      {/* ── Desktop: single row ───────────────────────────────────────── */}
      <div className="hidden md:flex items-center gap-3">

        {/* Time */}
        <div
          className="font-mono text-sm tabular-nums text-foreground-secondary min-w-[112px]"
          aria-live="polite"
          aria-atomic="true"
        >
          <span aria-label="Current time">{formatTime(player.currentTime)}</span>
          <span className="text-foreground-muted mx-1" aria-hidden="true">/</span>
          <span aria-label="Total duration">{formatTime(duration)}</span>
        </div>

        <div className="h-5 w-px bg-border shrink-0" aria-hidden="true" />

        {/* Playback */}
        <div className="flex items-center gap-1" role="group" aria-label="Playback">
          <Button
            size="sm" variant="ghost"
            onClick={handleSeekBack}
            disabled={isDisabled}
            aria-label={`Seek back ${SEEK_STEP} seconds`}
          >
            <SkipBack size={16} aria-hidden="true" />
          </Button>

          <Button
            size="sm" variant="primary"
            onClick={togglePlayPause}
            disabled={isDisabled}
            aria-label={player.isPlaying ? 'Pause' : 'Play'}
            className="w-9 h-9"
          >
            {player.isPlaying
              ? <Pause size={18} aria-hidden="true" />
              : <Play  size={18} aria-hidden="true" />}
          </Button>

          <Button
            size="sm" variant="ghost"
            onClick={handleSeekForward}
            disabled={isDisabled}
            aria-label={`Seek forward ${SEEK_STEP} seconds`}
          >
            <SkipForward size={16} aria-hidden="true" />
          </Button>
        </div>

        <div className="h-5 w-px bg-border shrink-0" aria-hidden="true" />

        {/* Volume */}
        <div className="flex items-center gap-2" role="group" aria-label="Volume">
          <Button
            size="sm" variant="ghost"
            onClick={handleMuteToggle}
            aria-label={player.muted ? 'Unmute' : 'Mute'}
          >
            {player.muted || player.volume === 0
              ? <VolumeX size={16} aria-hidden="true" />
              : <Volume2 size={16} aria-hidden="true" />}
          </Button>

          <Slider
            value={player.muted ? 0 : player.volume}
            min={0} max={1} step={0.02}
            onChange={handleVolumeChange}
            className="w-24"
            aria-label="Volume"
          />

          <span className="text-xs text-foreground-muted tabular-nums w-8 text-right">
            {Math.round((player.muted ? 0 : player.volume) * 100)}%
          </span>
        </div>

        <div className="h-5 w-px bg-border shrink-0" aria-hidden="true" />

        {/* Zoom */}
        <div className="flex items-center gap-2 ml-auto" role="group" aria-label="Zoom">
          <Button
            size="sm" variant="ghost"
            onClick={handleZoomOut}
            disabled={isDisabled || zoom <= 10}
            aria-label="Zoom out"
          >
            <ZoomOut size={16} aria-hidden="true" />
          </Button>

          <Slider
            value={zoom} min={10} max={500} step={10}
            onChange={handleZoomSliderChange}
            className="w-28"
            aria-label="Zoom level"
            disabled={isDisabled}
          />

          <Button
            size="sm" variant="ghost"
            onClick={handleZoomIn}
            disabled={isDisabled || zoom >= 500}
            aria-label="Zoom in"
          >
            <ZoomIn size={16} aria-hidden="true" />
          </Button>

          <span
            className="text-[11px] text-foreground-muted tabular-nums"
            aria-label={`Zoom: ${zoom} pixels per second`}
          >
            {zoom} px/s
          </span>
        </div>
      </div>

      {/* ── Selection info (shared) ───────────────────────────────────── */}
      {selection && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30 text-sm"
          role="status"
          aria-label="Current audio selection"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-primary shrink-0" aria-hidden="true" />

          <div className="flex items-center gap-1.5 font-mono tabular-nums text-foreground min-w-0 truncate">
            <span aria-label="Selection start">{formatTime(selection.start)}</span>
            <span className="text-foreground-muted" aria-hidden="true">—</span>
            <span aria-label="Selection end">{formatTime(selection.end)}</span>
            <span className="text-foreground-muted text-xs ml-0.5 hidden sm:inline">
              ({formatTime(selection.duration)})
            </span>
          </div>

          <div className="flex items-center gap-1 ml-auto shrink-0">
            <Button
              size="sm" variant="ghost"
              onClick={handlePlaySelection}
              disabled={isDisabled}
              aria-label="Play selection from start"
              className="text-primary hover:text-primary-hover text-xs"
            >
              <Play size={13} className="mr-1" aria-hidden="true" />
              <span className="hidden sm:inline">Preview</span>
            </Button>

            <Button
              size="sm" variant="ghost"
              onClick={handleClearSelection}
              aria-label="Clear selection"
              className="text-foreground-muted hover:text-foreground"
            >
              <X size={14} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
