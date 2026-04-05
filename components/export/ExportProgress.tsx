'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Download, CheckCircle2, XCircle, Loader2, Play, Pause } from 'lucide-react'
import { clsx } from 'clsx'
import { useExportStatus } from '@/store/useAudioStore'
import { triggerDownload, formatBytes } from '@/lib/audioExporter'
import { Button } from '@/components/ui'
import type { ExportPhase } from '@/types/export'

interface ExportProgressProps {
  className?: string
}

// ── Phase indicator ───────────────────────────────────────────────────────────

const PHASE_LABELS: Record<ExportPhase, string> = {
  idle:       'Ready',
  processing: 'Processing audio…',
  encoding:   'Encoding…',
  tagging:    'Writing tags…',
  done:       'Export complete',
  error:      'Export failed',
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div
      className={clsx('relative h-2 rounded-full bg-background-tertiary overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${value}%`}
    >
      <div
        className={clsx(
          'h-full rounded-full transition-all duration-300 ease-out',
          value < 100 ? 'bg-primary' : 'bg-green-500'
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExportProgress({ className }: ExportProgressProps) {
  const status = useExportStatus()
  const [playingFileId, setPlayingFileId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Pause & clean up audio element on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const handleTogglePlay = useCallback((file: { segmentId: string; url: string }) => {
    if (playingFileId === file.segmentId) {
      audioRef.current?.pause()
      setPlayingFileId(null)
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    const audio = new Audio(file.url)
    audio.onended = () => setPlayingFileId(null)
    audio.play().catch(() => {})
    audioRef.current = audio
    setPlayingFileId(file.segmentId)
  }, [playingFileId])

  if (status.phase === 'idle') return null

  const isDone    = status.phase === 'done'
  const isError   = status.phase === 'error'
  const isRunning = !isDone && !isError

  const phaseLabel  = PHASE_LABELS[status.phase]
  const segmentText =
    status.totalSegments > 1
      ? `Segment ${status.currentSegmentIndex + 1} of ${status.totalSegments}`
      : null

  return (
    <section
      className={clsx(
        'rounded-xl border p-5 space-y-4',
        isDone
          ? 'border-green-500/30 bg-green-500/5'
          : isError
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-border bg-background-secondary',
        className
      )}
      aria-live="polite"
      aria-label="Export progress"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        {isDone ? (
          <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" aria-hidden="true" />
        ) : isError ? (
          <XCircle className="h-5 w-5 text-red-400 shrink-0" aria-hidden="true" />
        ) : (
          <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" aria-hidden="true" />
        )}

        <div className="flex-1 min-w-0">
          <p className={clsx(
            'text-sm font-semibold',
            isDone ? 'text-green-400' : isError ? 'text-red-400' : 'text-foreground'
          )}>
            {phaseLabel}
          </p>
          {segmentText && !isDone && !isError && (
            <p className="text-xs text-foreground-secondary">{segmentText}</p>
          )}
        </div>

        {isRunning && (
          <span className="text-xs font-mono text-primary tabular-nums">
            {status.overallProgress}%
          </span>
        )}
      </div>

      {/* Progress bars */}
      {isRunning && (
        <div className="space-y-2">
          {status.totalSegments > 1 && (
            <div className="space-y-1">
              <span className="text-xs text-foreground-muted">Current segment</span>
              <ProgressBar value={status.segmentProgress} />
            </div>
          )}
          <div className="space-y-1">
            {status.totalSegments > 1 && (
              <span className="text-xs text-foreground-muted">Overall</span>
            )}
            <ProgressBar value={status.overallProgress} />
          </div>
        </div>
      )}

      {/* Error */}
      {isError && status.error && (
        <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
          {status.error}
        </p>
      )}

      {/* Results */}
      {isDone && status.completedFiles.length > 0 && (
        <div className="space-y-2">
          {status.completedFiles.map((file, idx) => (
            <div
              key={`${file.segmentId}-${idx}`}
              className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-background border border-border"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Download className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
                <span className="text-sm text-foreground truncate">{file.name}</span>
                <span className="text-xs text-foreground-muted shrink-0">
                  {formatBytes(file.sizeBytes)}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTogglePlay(file)}
                  aria-label={playingFileId === file.segmentId ? `Stop ${file.name}` : `Play ${file.name}`}
                  aria-pressed={playingFileId === file.segmentId}
                >
                  {playingFileId === file.segmentId
                    ? <Pause className="h-3.5 w-3.5" />
                    : <Play className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => triggerDownload(file.blob, file.name)}
                  aria-label={`Download ${file.name}`}
                >
                  Download
                </Button>
              </div>
            </div>
          ))}

          {/* Download all button when multiple results */}
          {status.completedFiles.length > 1 && (
            <Button
              variant="primary"
              size="sm"
              className="w-full mt-2"
              onClick={() => {
                for (const f of status.completedFiles) {
                  triggerDownload(f.blob, f.name)
                }
              }}
              aria-label="Download all exported files"
            >
              <Download className="h-4 w-4 mr-2" />
              Download All ({status.completedFiles.length})
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
