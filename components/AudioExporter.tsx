'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Download, FileAudio, Trash2, Play, Pause } from 'lucide-react'
import { clsx } from 'clsx'
import { useAudioStore, useSegments } from '@/store/useAudioStore'
import { useAudioWorker } from '@/lib/useAudioWorker'
import { Button, Input, LoadingSpinner } from '@/components/ui'
import { formatTime, downloadAudio, audioBufferToWav } from '@/lib/audioUtils'
import type { BaseComponentProps, AudioSegment, ExportOptions } from '@/types/audio'

export interface AudioExporterProps extends BaseComponentProps {
  onExportComplete?: (filename: string) => void
}

export function AudioExporter({
  disabled = false,
  className,
  onExportComplete,
  'aria-label': ariaLabel = 'Audio export controls'
}: AudioExporterProps) {
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('wav')
  const [exportQuality, setExportQuality] = useState<'high' | 'medium' | 'low'>('high')
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewingSegment, setPreviewingSegment] = useState<string | null>(null)

  const segments = useSegments()
  const { removeSegment, setActiveSegment, audioContext, initAudioContext } = useAudioStore()
  const { exportAudio } = useAudioWorker()

  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null)

  const hasSegments = segments.length > 0

  // Stop playback and clean up on unmount
  useEffect(() => {
    return () => {
      playbackSourceRef.current?.stop()
      playbackSourceRef.current?.disconnect()
      playbackSourceRef.current = null
    }
  }, [])

  const handleExportSegment = useCallback(async (segment: AudioSegment) => {
    if (!segment.buffer) {
      setError('Segment buffer not available')
      return
    }

    // Strip any characters that are not alphanumeric, dash, or underscore
    // (no dots — we append the extension ourselves)
    const filename = segment.name
      .replace(/[^a-z0-9-]/gi, '_')
      .toLowerCase()
      .replace(/^_+|_+$/g, '') || 'segment'

    setIsExporting(true)
    setError(null)

    try {
      // For now, export as WAV since it's simpler
      // MP3 encoding would require additional libraries
      const wavBlob = audioBufferToWav(segment.buffer)
      const finalFilename = `${filename}.wav`

      downloadAudio(wavBlob, finalFilename)
      onExportComplete?.(finalFilename)

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to export audio'
      setError(errorMsg)
    } finally {
      setIsExporting(false)
    }
  }, [onExportComplete])

  const handleExportAll = useCallback(async () => {
    if (segments.length === 0) return

    setIsExporting(true)
    setError(null)

    try {
      for (const segment of segments) {
        await handleExportSegment(segment)
        // Small delay between exports
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to export all segments'
      setError(errorMsg)
    } finally {
      setIsExporting(false)
    }
  }, [segments, handleExportSegment])

  const handleDeleteSegment = useCallback((segmentId: string) => {
    removeSegment(segmentId)
  }, [removeSegment])

  const handlePreviewSegment = useCallback(async (segment: AudioSegment) => {
    if (!segment.buffer) return

    // Always stop whatever is currently playing first
    playbackSourceRef.current?.stop()
    playbackSourceRef.current?.disconnect()
    playbackSourceRef.current = null

    if (previewingSegment === segment.id) {
      // User pressed stop — already cleaned up above
      setPreviewingSegment(null)
      return
    }

    try {
      const ctx = audioContext?.state === 'running'
        ? audioContext
        : await initAudioContext()

      const source = ctx.createBufferSource()
      source.buffer = segment.buffer
      source.connect(ctx.destination)
      source.onended = () => {
        playbackSourceRef.current = null
        setPreviewingSegment(null)
      }
      source.start(0)
      playbackSourceRef.current = source
      setPreviewingSegment(segment.id)
      setActiveSegment(segment)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to play segment')
    }
  }, [previewingSegment, setActiveSegment, audioContext, initAudioContext])

  if (!hasSegments) {
    return (
      <div className={clsx('space-y-4', className)} aria-label={ariaLabel}>
        <h2 className="text-xl font-semibold text-foreground flex items-center space-x-2">
          <Download className="h-5 w-5 text-primary" />
          <span>Export Audio</span>
        </h2>

        <div className="text-center py-8 text-foreground-muted">
          <FileAudio className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No audio segments to export</p>
          <p className="text-sm mt-1">Cut audio segments first using the controls above</p>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx('space-y-6', className)} aria-label={ariaLabel}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground flex items-center space-x-2">
            <Download className="h-5 w-5 text-primary" />
            <span>Export Audio</span>
            <span className="text-sm text-foreground-secondary font-normal ml-2">
              ({segments.length} segment{segments.length !== 1 ? 's' : ''})
            </span>
          </h2>

          <Button
            onClick={handleExportAll}
            disabled={disabled || isExporting || segments.length === 0}
            loading={isExporting}
            variant="secondary"
            size="sm"
          >
            Export All
          </Button>
        </div>

        {/* Export format options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-background-secondary rounded-lg border border-border">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Export Format</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'wav' | 'mp3')}
              disabled={disabled}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
            >
              <option value="wav">WAV (Lossless)</option>
              <option value="mp3" disabled>MP3 (Coming Soon)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Quality</label>
            <select
              value={exportQuality}
              onChange={(e) => setExportQuality(e.target.value as 'high' | 'medium' | 'low')}
              disabled={disabled}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
            >
              <option value="high">High (320 kbps)</option>
              <option value="medium">Medium (192 kbps)</option>
              <option value="low">Low (128 kbps)</option>
            </select>
          </div>
        </div>

        {/* Segments list */}
        <div className="space-y-3">
          {segments.map((segment) => (
            <div
              key={segment.id}
              className="flex items-center justify-between p-4 bg-background-secondary rounded-lg border border-border hover:border-border-hover transition-colors"
            >
              <div className="flex items-center space-x-3 flex-1">
                <div className="p-2 bg-primary/20 rounded-lg">
                  <FileAudio className="h-4 w-4 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{segment.name}</p>
                  <p className="text-sm text-foreground-secondary">
                    {formatTime(segment.start)} → {formatTime(segment.end)} •
                    Duration: {formatTime(segment.duration)}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {/* Preview button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePreviewSegment(segment)}
                  disabled={disabled || !segment.buffer}
                  aria-label="Preview segment"
                >
                  {previewingSegment === segment.id ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>

                {/* Export button */}
                <Button
                  onClick={() => handleExportSegment(segment)}
                  disabled={disabled || isExporting || !segment.buffer}
                  size="sm"
                  aria-label={`Export ${segment.name}`}
                >
                  {isExporting ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>

                {/* Delete button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteSegment(segment.id)}
                  disabled={disabled}
                  aria-label={`Delete ${segment.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}

        {/* Help text */}
        <div className="text-xs text-foreground-muted space-y-1">
          <p>Export segments as high-quality WAV files for maximum compatibility</p>
          <p>MP3 export will be available in a future update</p>
          <p>Use the preview button to listen to segments before exporting</p>
        </div>
      </div>
    </div>
  )
}