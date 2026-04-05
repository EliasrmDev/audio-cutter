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
        'flex flex-col gap-3 px-4 py-3 bg-background-secondary border border-border rounded-lg',
        className
      )}
      role="toolbar"
      aria-label={ariaLabel}
    >
      {/* ── Row 1: Time display + Playback + Volume ────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Time */}
        <div className="font-mono text-sm tabular-nums text-foreground-secondary min-w-[112px]"
          aria-live="polite" aria-atomic="true">
          <span aria-label="Current time">{formatTime(player.currentTime)}</span>
          <span className="text-foreground-muted mx-1" aria-hidden="true">/</span>
          <span aria-label="Total duration">{formatTime(duration)}</span>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-1" role="group" aria-label="Playback">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSeekBack}
            disabled={isDisabled}
            aria-label={`Seek back ${SEEK_STEP} seconds`}
          >
            <SkipBack size={16} aria-hidden="true" />
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={togglePlayPause}
            disabled={isDisabled}
            aria-label={player.isPlaying ? 'Pause' : 'Play'}
            className="w-9 h-9"
          >
            {player.isPlaying
              ? <Pause size={18} aria-hidden="true" />
              : <Play size={18} aria-hidden="true" />}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleSeekForward}
            disabled={isDisabled}
            aria-label={`Seek forward ${SEEK_STEP} seconds`}
          >
            <SkipForward size={16} aria-hidden="true" />
          </Button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2" role="group" aria-label="Volume">
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
            min={0}
            max={1}
            step={0.02}
            onChange={handleVolumeChange}
            className="w-24"
            aria-label="Volume"
          />

          <span className="text-xs text-foreground-muted tabular-nums w-8 text-right">
            {Math.round((player.muted ? 0 : player.volume) * 100)}%
          </span>
        </div>

        {/* ── Zoom controls ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 ml-auto" role="group" aria-label="Zoom">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleZoomOut}
            disabled={isDisabled || zoom <= 10}
            aria-label="Zoom out"
          >
            <ZoomOut size={16} aria-hidden="true" />
          </Button>

          <Slider
            value={zoom}
            min={10}
            max={500}
            step={10}
            onChange={handleZoomSliderChange}
            className="w-28"
            aria-label="Zoom level"
            disabled={isDisabled}
          />

          <Button
            size="sm"
            variant="ghost"
            onClick={handleZoomIn}
            disabled={isDisabled || zoom >= 500}
            aria-label="Zoom in"
          >
            <ZoomIn size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* ── Row 2: Selection info ─────────────────────────────────────── */}
      {selection && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-primary/10 border border-primary/30 text-sm"
          role="status" aria-label="Current audio selection">
          <span className="inline-block w-2 h-2 rounded-full bg-primary flex-shrink-0" aria-hidden="true" />
          <span className="font-mono text-foreground tabular-nums">
            {formatTime(selection.start)}
          </span>
          <span className="text-foreground-muted" aria-hidden="true">—</span>
          <span className="font-mono text-foreground tabular-nums">
            {formatTime(selection.end)}
          </span>
          <span className="text-foreground-muted text-xs">
            ({formatTime(selection.duration)})
          </span>

          <div className="flex items-center gap-1 ml-auto">
            <Button
              size="sm"
              variant="ghost"
              onClick={handlePlaySelection}
              disabled={isDisabled}
              aria-label="Play selection from start"
              className="text-primary hover:text-primary-hover text-xs"
            >
              <Play size={13} className="mr-1" aria-hidden="true" />
              Preview
            </Button>

            <Button
              size="sm"
              variant="ghost"
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
