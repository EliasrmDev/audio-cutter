'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { clsx } from 'clsx'
import { useAudioStore, usePlayer, useSelection } from '@/store/useAudioStore'
import type { WaveformData, AudioSelection, BaseComponentProps } from '@/types/audio'
import { formatTime } from '@/lib/audioUtils'

export interface AudioWaveformProps extends BaseComponentProps {
  width?: number
  height?: number
  pixelsPerSecond?: number
  onSelectionChange?: (selection: AudioSelection | null) => void
  onSeek?: (time: number) => void
}

export function AudioWaveform({
  width = 800,
  height = 200,
  pixelsPerSecond = 100,
  disabled = false,
  className,
  onSelectionChange,
  onSeek,
  'aria-label': ariaLabel = 'Audio waveform'
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'seek' | null>(null)
  const [dragStartX, setDragStartX] = useState(0)

  const waveformData = useAudioStore(state => state.waveformData)
  const audioFile = useAudioStore(state => state.audioFile)
  const player = usePlayer()
  const selection = useSelection()
  const { setSelection, updateSelection } = useAudioStore()

  const duration = audioFile?.duration || 0
  const actualWidth = Math.max(width, duration * pixelsPerSecond)

  // Colors for dark theme with orange accents
  const colors = {
    background: '#1a1a1a',
    waveform: '#444444',
    waveformHover: '#555555',
    progress: '#e07b39',
    selection: 'rgba(224, 123, 57, 0.3)',
    selectionBorder: '#e07b39',
    cursor: '#ffffff',
    grid: 'rgba(255, 255, 255, 0.1)',
    text: '#ffffff'
  }

  // Convert time to pixel position
  const timeToPixel = useCallback((time: number) => {
    return (time / duration) * actualWidth
  }, [duration, actualWidth])

  // Convert pixel position to time
  const pixelToTime = useCallback((pixel: number) => {
    return (pixel / actualWidth) * duration
  }, [duration, actualWidth])

  // Draw waveform on canvas
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !waveformData) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = actualWidth
    canvas.height = height

    // Clear canvas
    ctx.fillStyle = colors.background
    ctx.fillRect(0, 0, actualWidth, height)

    // Draw grid lines (time markers)
    ctx.strokeStyle = colors.grid
    ctx.lineWidth = 1
    const gridInterval = Math.max(1, Math.floor(60 / pixelsPerSecond)) // Grid every ~60 pixels
    for (let i = 0; i <= duration; i += gridInterval) {
      const x = timeToPixel(i)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()

      // Time labels
      if (i % (gridInterval * 2) === 0) {
        ctx.fillStyle = colors.text
        ctx.font = '10px monospace'
        ctx.fillText(formatTime(i), x + 2, 12)
      }
    }

    // Draw waveform
    const peaks = waveformData.peaks[0] // Use first channel
    const barWidth = actualWidth / peaks.length

    ctx.fillStyle = colors.waveform

    for (let i = 0; i < peaks.length; i++) {
      const barHeight = peaks[i] * (height * 0.8) // Leave some padding
      const x = i * barWidth
      const y = (height - barHeight) / 2

      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight)
    }

    // Draw selection
    if (selection) {
      const startX = timeToPixel(selection.start)
      const endX = timeToPixel(selection.end)
      const selectionWidth = endX - startX

      // Selection background
      ctx.fillStyle = colors.selection
      ctx.fillRect(startX, 0, selectionWidth, height)

      // Selection borders
      ctx.strokeStyle = colors.selectionBorder
      ctx.lineWidth = 2

      ctx.beginPath()
      ctx.moveTo(startX, 0)
      ctx.lineTo(startX, height)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(endX, 0)
      ctx.lineTo(endX, height)
      ctx.stroke()

      // Selection info
      ctx.fillStyle = colors.text
      ctx.font = '12px monospace'
      const selectionInfo = `${formatTime(selection.start)} - ${formatTime(selection.end)} (${formatTime(selection.duration)})`
      ctx.fillText(selectionInfo, startX + 5, height - 10)
    }

    // Draw playback cursor
    if (player.currentTime > 0 && player.currentTime <= duration) {
      const cursorX = timeToPixel(player.currentTime)

      ctx.strokeStyle = colors.cursor
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cursorX, 0)
      ctx.lineTo(cursorX, height)
      ctx.stroke()

      // Current time label
      ctx.fillStyle = colors.text
      ctx.font = '12px monospace'
      ctx.fillText(formatTime(player.currentTime), cursorX + 5, 25)
    }

    // Draw progress (for playing audio)
    if (player.isPlaying && player.currentTime > 0) {
      const progressX = timeToPixel(player.currentTime)

      ctx.fillStyle = colors.progress
      ctx.globalAlpha = 0.3
      ctx.fillRect(0, 0, progressX, height)
      ctx.globalAlpha = 1
    }

  }, [waveformData, actualWidth, height, timeToPixel, selection, player, duration, colors, pixelsPerSecond])

  // Redraw when data changes
  useEffect(() => {
    drawWaveform()
  }, [drawWaveform])

  // Handle mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled || !waveformData) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = pixelToTime(x)

    setDragStartX(x)

    // Check if clicking on selection handles
    if (selection) {
      const startX = timeToPixel(selection.start)
      const endX = timeToPixel(selection.end)
      const handleSize = 8

      if (Math.abs(x - startX) < handleSize) {
        setIsDragging('start')
        return
      }

      if (Math.abs(x - endX) < handleSize) {
        setIsDragging('end')
        return
      }

      // Check if clicking within selection
      if (x >= startX && x <= endX) {
        onSeek?.(time)
        return
      }
    }

    // Start new selection or seek
    if (e.shiftKey && selection) {
      // Extend selection
      const newSelection = {
        start: Math.min(selection.start, time),
        end: Math.max(selection.end, time),
        duration: Math.abs(time - (time < selection.start ? selection.end : selection.start))
      }
      setSelection(newSelection)
      onSelectionChange?.(newSelection)
    } else if (e.metaKey || e.ctrlKey) {
      // Start new selection
      setIsDragging('end')
      const newSelection = {
        start: time,
        end: time,
        duration: 0
      }
      setSelection(newSelection)
    } else {
      // Seek to position
      onSeek?.(time)
      setIsDragging('seek')
    }
  }, [disabled, waveformData, pixelToTime, timeToPixel, selection, setSelection, onSelectionChange, onSeek])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || disabled || !waveformData) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = Math.max(0, Math.min(pixelToTime(x), duration))

    if (isDragging === 'start' && selection) {
      const newEnd = Math.max(time + 0.1, selection.end) // Minimum duration
      updateSelection({
        start: time,
        duration: newEnd - time
      })
    } else if (isDragging === 'end' && selection) {
      const newStart = Math.min(time - 0.1, selection.start) // Minimum duration
      updateSelection({
        end: time,
        start: newStart,
        duration: time - newStart
      })
    } else if (isDragging === 'seek') {
      onSeek?.(time)
    }

  }, [isDragging, disabled, waveformData, pixelToTime, duration, selection, updateSelection, onSeek])

  const handleMouseUp = useCallback(() => {
    if (isDragging && selection) {
      onSelectionChange?.(selection)
    }
    setIsDragging(null)
  }, [isDragging, selection, onSelectionChange])

  // Global mouse up handler
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => {
        setIsDragging(null)
      }

      document.addEventListener('mouseup', handleGlobalMouseUp)
      document.addEventListener('mouseleave', handleGlobalMouseUp)

      return () => {
        document.removeEventListener('mouseup', handleGlobalMouseUp)
        document.removeEventListener('mouseleave', handleGlobalMouseUp)
      }
    }
  }, [isDragging])

  // Loading state
  if (!waveformData) {
    return (
      <div
        className={clsx(
          'waveform-container flex items-center justify-center',
          className
        )}
        style={{ width, height }}
      >
        <div className="text-foreground-secondary">
          <div className="flex items-center gap-1 mb-2">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-border rounded-full waveform-loading-bar"
                style={{
                  height: `${Math.random() * 60 + 20}%`,
                  animationDelay: `${i * 0.1}s`
                }}
              />
            ))}
          </div>
          <p className="text-sm text-center">Generating waveform...</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={clsx(
        'waveform-container overflow-x-auto overflow-y-hidden',
        {
          'cursor-crosshair': !disabled,
          'cursor-not-allowed opacity-50': disabled
        },
        className
      )}
      style={{ width, height }}
    >
      <canvas
        ref={canvasRef}
        className="block"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'crosshair' }}
        aria-label={ariaLabel}
        role="img"
        tabIndex={disabled ? -1 : 0}
      />

      {/* Keyboard shortcuts help */}
      <div className="mt-2 text-xs text-foreground-muted space-y-1">
        <p><kbd className="px-1 py-0.5 bg-background-secondary rounded">Click</kbd> to seek</p>
        <p><kbd className="px-1 py-0.5 bg-background-secondary rounded">Cmd/Ctrl + Click</kbd> to start selection</p>
        <p><kbd className="px-1 py-0.5 bg-background-secondary rounded">Shift + Click</kbd> to extend selection</p>
        <p><kbd className="px-1 py-0.5 bg-background-secondary rounded">Drag</kbd> selection handles to adjust</p>
      </div>
    </div>
  )
}