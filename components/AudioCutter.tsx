'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Scissors, Play, Pause, RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'
import { useAudioStore, useSelection, useAudioFile, usePlayer } from '@/store/useAudioStore'
import { useAudioWorker } from '@/lib/useAudioWorker'
import { Button, Input, LoadingSpinner } from '@/components/ui'
import { formatTime, parseTime } from '@/lib/audioUtils'
import { validateAudioSelection } from '@/lib/validators'
import type { BaseComponentProps, AudioSelection, AudioSegment } from '@/types/audio'

export interface AudioCutterProps extends BaseComponentProps {
  onSegmentCreated?: (segment: AudioSegment) => void
}

export function AudioCutter({
  disabled = false,
  className,
  onSegmentCreated,
  'aria-label': ariaLabel = 'Audio cutting controls'
}: AudioCutterProps) {
  const [startTimeInput, setStartTimeInput] = useState('')
  const [endTimeInput, setEndTimeInput] = useState('')
  const [segmentName, setSegmentName] = useState('')
  const [isCutting, setIsCutting] = useState(false)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null)

  const audioFile = useAudioFile()
  const selection = useSelection()
  const player = usePlayer()
  const {
    setSelection,
    addSegment,
    setActiveSegment,
    audioBuffer,
    audioContext,
    initAudioContext,
  } = useAudioStore()

  const { cutAudio } = useAudioWorker()

  // Stop preview on unmount
  useEffect(() => {
    return () => {
      previewSourceRef.current?.stop()
      previewSourceRef.current?.disconnect()
    }
  }, [])

  const isReady = audioFile && audioBuffer
  const duration = audioFile?.duration || 0

  // Update inputs when selection changes
  React.useEffect(() => {
    if (selection) {
      setStartTimeInput(formatTime(selection.start))
      setEndTimeInput(formatTime(selection.end))
      setSegmentName(`Segment ${formatTime(selection.start)}-${formatTime(selection.end)}`)
    }
  }, [selection])

  const handleStartTimeChange = useCallback((value: string) => {
    setStartTimeInput(value)

    try {
      const startTime = parseTime(value)
      if (startTime >= 0 && startTime <= duration) {
        const endTime = selection?.end || Math.min(startTime + 10, duration)
        const newSelection: AudioSelection = {
          start: startTime,
          end: endTime,
          duration: endTime - startTime
        }

        const validation = validateAudioSelection(newSelection)
        if (validation.success) {
          setSelection(newSelection)
          setError(null)
        } else {
          setError('Invalid start time')
        }
      }
    } catch {
      // Invalid time format, don't update selection
    }
  }, [duration, selection?.end, setSelection])

  const handleEndTimeChange = useCallback((value: string) => {
    setEndTimeInput(value)

    try {
      const endTime = parseTime(value)
      if (endTime >= 0 && endTime <= duration) {
        const startTime = selection?.start || 0
        const newSelection: AudioSelection = {
          start: startTime,
          end: endTime,
          duration: endTime - startTime
        }

        const validation = validateAudioSelection(newSelection)
        if (validation.success) {
          setSelection(newSelection)
          setError(null)
        } else {
          setError('Invalid end time')
        }
      }
    } catch {
      // Invalid time format, don't update selection
    }
  }, [duration, selection?.start, setSelection])

  const handleSetCurrentTime = useCallback((type: 'start' | 'end') => {
    const currentTime = player.currentTime

    if (type === 'start') {
      const endTime = selection?.end || Math.min(currentTime + 10, duration)
      const newSelection: AudioSelection = {
        start: currentTime,
        end: endTime,
        duration: endTime - currentTime
      }
      setSelection(newSelection)
    } else {
      const startTime = selection?.start || 0
      const newSelection: AudioSelection = {
        start: startTime,
        end: currentTime,
        duration: currentTime - startTime
      }
      setSelection(newSelection)
    }
  }, [player.currentTime, selection, duration, setSelection])

  const handlePreviewSelection = useCallback(async () => {
    // Read live to avoid stale closure after async context init
    const { selection: sel, audioBuffer: buf } = useAudioStore.getState()
    if (!sel || !buf) return

    // Stop current preview
    if (previewSourceRef.current) {
      previewSourceRef.current.stop()
      previewSourceRef.current.disconnect()
      previewSourceRef.current = null
      setIsPreviewPlaying(false)
      return
    }

    try {
      const storeState = useAudioStore.getState()
      const ctx = storeState.audioContext?.state === 'running'
        ? storeState.audioContext
        : await storeState.initAudioContext()

      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.onended = () => {
        previewSourceRef.current = null
        setIsPreviewPlaying(false)
      }
      // start(when, offset, duration) — plays only the selected region
      src.start(0, sel.start, sel.end - sel.start)
      previewSourceRef.current = src
      setIsPreviewPlaying(true)
    } catch (err) {
      console.error('Preview error:', err)
    }
  }, [])

  const handleCutAudio = useCallback(async () => {
    if (!selection || !audioBuffer || !isReady) {
      setError('No valid selection to cut')
      return
    }

    // Validate selection
    const validation = validateAudioSelection(selection)
    if (!validation.success) {
      setError('Invalid selection range')
      return
    }

    setIsCutting(true)
    setError(null)

    try {
      // Cut audio using Web Worker
      const cutBuffer = await cutAudio(
        audioBuffer,
        selection,
        (progress) => {
          // Progress handled by loading state for now
        }
      )

      // Create audio segment
      const segment: AudioSegment = {
        id: `segment_${Date.now()}`,
        name: segmentName || `Segment ${formatTime(selection.start)}-${formatTime(selection.end)}`,
        start: selection.start,
        end: selection.end,
        duration: selection.duration,
        buffer: cutBuffer,
        url: undefined, // Will be created when needed
        createdAt: new Date()
      }

      addSegment(segment)
      setActiveSegment(segment)
      onSegmentCreated?.(segment)

      // Reset form
      setSegmentName('')
      setSelection(null)
      setStartTimeInput('')
      setEndTimeInput('')

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to cut audio'
      setError(errorMsg)
    } finally {
      setIsCutting(false)
    }
  }, [selection, audioBuffer, isReady, segmentName, cutAudio, addSegment, setActiveSegment, onSegmentCreated, setSelection])

  const handleReset = useCallback(() => {
    setSelection(null)
    setStartTimeInput('')
    setEndTimeInput('')
    setSegmentName('')
    setError(null)
  }, [setSelection])

  return (
    <div className={clsx('space-y-6', className)} aria-label={ariaLabel}>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground flex items-center space-x-2">
          <Scissors className="h-5 w-5 text-primary" />
          <span>Cut Audio</span>
        </h2>

        {/* Selection inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Start Time</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSetCurrentTime('start')}
                disabled={disabled || !isReady}
                className="text-xs"
              >
                Use Current
              </Button>
            </div>
            <Input
              value={startTimeInput}
              onChange={handleStartTimeChange}
              placeholder="00:00.000"
              disabled={disabled || !isReady}
              aria-label="Selection start time"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">End Time</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSetCurrentTime('end')}
                disabled={disabled || !isReady}
                className="text-xs"
              >
                Use Current
              </Button>
            </div>
            <Input
              value={endTimeInput}
              onChange={handleEndTimeChange}
              placeholder="00:00.000"
              disabled={disabled || !isReady}
              aria-label="Selection end time"
            />
          </div>
        </div>

        {/* Selection info */}
        {selection && (
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground-secondary">
                Selection: <span className="font-mono">{formatTime(selection.start)}</span> →
                <span className="font-mono ml-1">{formatTime(selection.end)}</span>
              </span>
              <span className="text-primary font-medium">
                Duration: {formatTime(selection.duration)}
              </span>
            </div>
          </div>
        )}

        {/* Segment name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Segment Name</label>
          <Input
            value={segmentName}
            onChange={setSegmentName}
            placeholder="Enter segment name (optional)"
            disabled={disabled || !isReady}
            aria-label="Segment name"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-3">
          <Button
            onClick={handleCutAudio}
            disabled={disabled || !selection || !isReady || isCutting}
            loading={isCutting}
            className="flex-1"
            aria-label="Cut audio segment"
          >
            {isCutting ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Cutting...
              </>
            ) : (
              <>
                <Scissors className="h-4 w-4 mr-2" />
                Cut Audio
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            onClick={handlePreviewSelection}
            disabled={disabled || !selection || !isReady}
            aria-label="Preview selection"
          >
            {isPreviewPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            onClick={handleReset}
            disabled={disabled || (!selection && !startTimeInput && !endTimeInput)}
            aria-label="Reset selection"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}

        {/* Help text */}
        <div className="text-xs text-foreground-muted space-y-1">
          <p>Time format: MM:SS.mmm (e.g., 01:23.456) or seconds (e.g., 83.456)</p>
          <p>Use the waveform visualization above to make visual selections</p>
          <p>Click "Use Current" to set selection points to the current playback time</p>
        </div>
      </div>
    </div>
  )
}