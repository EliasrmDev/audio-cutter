'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Download, FileAudio, Trash2, Play, Pause,
  ChevronDown, ChevronUp, Eye,
} from 'lucide-react'
import { clsx } from 'clsx'
import {
  useAudioStore,
  useSegments,
  useExportSettings,
  useExportStatus,
} from '@/store/useAudioStore'
import { runExport, triggerDownload, formatBytes } from '@/lib/audioExporter'
import { Button, LoadingSpinner } from '@/components/ui'
import { formatTime } from '@/lib/audioUtils'
import { ExportSettingsPanel } from './ExportSettings'
import { MetadataForm } from './MetadataForm'
import { ExportProgress } from './ExportProgress'
import type { AudioSegment } from '@/types/audio'
import type { ExportResultFile } from '@/types/export'
import type { BaseComponentProps } from '@/types/audio'

// ── Props ────────────────────────────────────────────────────────────────────

interface ExportPanelProps extends BaseComponentProps {
  onExportComplete?: (files: ExportResultFile[]) => void
}

// ── Segment row ───────────────────────────────────────────────────────────────

interface SegmentRowProps {
  segment: AudioSegment
  index: number
  isPreviewing: boolean
  onPreviewToggle: (seg: AudioSegment) => void
  onDelete: (id: string) => void
  onExportOne: (seg: AudioSegment) => void
  isExporting: boolean
}

function SegmentRow({
  segment,
  isPreviewing,
  onPreviewToggle,
  onDelete,
  onExportOne,
  isExporting,
}: SegmentRowProps) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors',
        isPreviewing
          ? 'border-primary/50 bg-primary/5'
          : 'border-border bg-background-secondary hover:border-border-hover'
      )}
    >
      {/* Icon */}
      <div
        className={clsx(
          'shrink-0 p-2 rounded-lg',
          isPreviewing ? 'bg-primary/30' : 'bg-primary/10'
        )}
        aria-hidden="true"
      >
        <FileAudio className="h-4 w-4 text-primary" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{segment.name}</p>
        <p className="text-xs text-foreground-secondary tabular-nums">
          {formatTime(segment.start)} → {formatTime(segment.end)}&nbsp;·&nbsp;
          {formatTime(segment.duration)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPreviewToggle(segment)}
          disabled={!segment.buffer}
          aria-label={isPreviewing ? `Stop preview of ${segment.name}` : `Preview ${segment.name}`}
          aria-pressed={isPreviewing}
        >
          {isPreviewing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onExportOne(segment)}
          disabled={isExporting || !segment.buffer}
          aria-label={`Export ${segment.name}`}
        >
          {isExporting ? <LoadingSpinner size="sm" /> : <Download className="h-3.5 w-3.5" />}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(segment.id)}
          disabled={isExporting}
          aria-label={`Delete ${segment.name}`}
        >
          <Trash2 className="h-3.5 w-3.5 text-red-400" />
        </Button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ExportPanel({
  disabled = false,
  className,
  onExportComplete,
  'aria-label': ariaLabel = 'Export audio',
}: ExportPanelProps) {
  const segments       = useSegments()
  const settings       = useExportSettings()
  const exportStatus   = useExportStatus()
  const {
    removeSegment, setActiveSegment,
    audioContext, initAudioContext,
    setExportStatus, resetExportStatus,
    exportMetadata,
  } = useAudioStore()

  const [showSettings, setShowSettings]   = useState(true)
  const [showMetadata, setShowMetadata]   = useState(false)
  const [previewingId, setPreviewingId]   = useState<string | null>(null)
  const playbackRef = useRef<AudioBufferSourceNode | null>(null)

  const isExporting = exportStatus.phase !== 'idle' && exportStatus.phase !== 'done' && exportStatus.phase !== 'error'

  // Stop any preview on unmount
  useEffect(() => {
    return () => {
      playbackRef.current?.stop()
      playbackRef.current?.disconnect()
    }
  }, [])

  // ── Preview ────────────────────────────────────────────────────────────────

  const handlePreviewToggle = useCallback(async (seg: AudioSegment) => {
    if (!seg.buffer) return

    // Stop current playback
    playbackRef.current?.stop()
    playbackRef.current?.disconnect()
    playbackRef.current = null

    if (previewingId === seg.id) {
      setPreviewingId(null)
      return
    }

    try {
      const ctx = audioContext?.state === 'running'
        ? audioContext
        : await initAudioContext()

      const src = ctx.createBufferSource()
      src.buffer = seg.buffer
      src.connect(ctx.destination)
      src.onended = () => {
        playbackRef.current = null
        setPreviewingId(null)
      }
      src.start(0)
      playbackRef.current = src
      setPreviewingId(seg.id)
      setActiveSegment(seg)
    } catch (err) {
      console.error('Preview error:', err)
    }
  }, [previewingId, audioContext, initAudioContext, setActiveSegment])

  // ── Export helpers ─────────────────────────────────────────────────────────

  const buildCommonExportArgs = useCallback(async (segs: AudioSegment[]) => {
    const ctx = audioContext?.state === 'running'
      ? audioContext
      : await initAudioContext()

    return {
      segments: segs,
      settings,
      metadata: exportMetadata,
      audioContext: ctx,
    }
  }, [audioContext, initAudioContext, settings, exportMetadata])

  const startExport = useCallback(async (segs: AudioSegment[]) => {
    if (segs.length === 0 || isExporting) return

    resetExportStatus()
    setExportStatus({
      phase: 'processing',
      totalSegments: settings.exportMode === 'concatenated' ? 1 : segs.length,
      currentSegmentIndex: 0,
      segmentProgress: 0,
      overallProgress: 0,
    })

    const common = await buildCommonExportArgs(segs)
    const total  = settings.exportMode === 'concatenated' ? 1 : segs.length

    try {
      const results = await runExport({
        ...common,
        onSegmentProgress: (segIdx, segP) => {
          const overall = Math.round(((segIdx + segP / 100) / total) * 100)
          setExportStatus({
            phase: overall < 80 ? 'processing' : 'encoding',
            currentSegmentIndex: segIdx,
            segmentProgress: segP,
            overallProgress: overall,
          })
        },
        onSegmentDone: result => {
          const current = useAudioStore.getState().exportStatus.completedFiles
          setExportStatus({
            completedFiles: [...current, result],
          })
        },
        onError: (_segIdx, message) => {
          setExportStatus({ phase: 'error', error: message })
        },
      })

      setExportStatus({
        phase: 'done',
        overallProgress: 100,
        segmentProgress: 100,
        completedFiles: results,
      })

      onExportComplete?.(results)
    } catch (err) {
      setExportStatus({
        phase: 'error',
        error: err instanceof Error ? err.message : 'Export failed',
      })
    }
  }, [
    isExporting, resetExportStatus, setExportStatus,
    buildCommonExportArgs, settings.exportMode, onExportComplete,
  ])

  const handleExportAll  = useCallback(() => startExport(segments),    [startExport, segments])
  const handleExportOne  = useCallback((seg: AudioSegment) => startExport([seg]), [startExport])
  const handleDelete     = useCallback((id: string) => removeSegment(id), [removeSegment])

  // ── Collapsible section ────────────────────────────────────────────────────

  const Section = ({
    title,
    open,
    toggle,
    children,
  }: {
    title: string
    open: boolean
    toggle: () => void
    children: React.ReactNode
  }) => (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className={clsx(
          'w-full flex items-center justify-between px-4 py-3',
          'text-sm font-semibold text-foreground',
          'hover:bg-background-secondary transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset'
        )}
        aria-expanded={open}
      >
        {title}
        {open
          ? <ChevronUp className="h-4 w-4 text-foreground-muted" aria-hidden="true" />
          : <ChevronDown className="h-4 w-4 text-foreground-muted" aria-hidden="true" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasSegments = segments.length > 0

  return (
    <div
      className={clsx('space-y-4', className)}
      aria-label={ariaLabel}
      aria-disabled={disabled}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" aria-hidden="true" />
          Export Audio
          {hasSegments && (
            <span className="text-sm font-normal text-foreground-secondary">
              ({segments.length} segment{segments.length !== 1 ? 's' : ''})
            </span>
          )}
        </h2>

        {hasSegments && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleExportAll}
            disabled={disabled || isExporting || !hasSegments}
            loading={isExporting}
            aria-label={
              settings.exportMode === 'concatenated'
                ? 'Export all segments as one file'
                : `Export ${segments.length} segment${segments.length !== 1 ? 's' : ''}`
            }
          >
            {isExporting ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Exporting…
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {settings.exportMode === 'concatenated'
                  ? 'Export Playlist'
                  : `Export All`}
              </>
            )}
          </Button>
        )}
      </div>

      {/* Progress / results */}
      <ExportProgress />

      {/* No segments placeholder */}
      {!hasSegments && (
        <div className="text-center py-10 rounded-xl border border-dashed border-border">
          <FileAudio className="h-10 w-10 mx-auto mb-3 text-foreground-muted opacity-40" aria-hidden="true" />
          <p className="text-foreground-muted">No audio segments yet.</p>
          <p className="text-sm text-foreground-muted mt-1">
            Use the waveform editor to cut segments first.
          </p>
        </div>
      )}

      {/* Segment list */}
      {hasSegments && (
        <div className="space-y-2" role="list" aria-label="Audio segments">
          {segments.map((seg, idx) => (
            <div key={seg.id} role="listitem">
              <SegmentRow
                segment={seg}
                index={idx}
                isPreviewing={previewingId === seg.id}
                onPreviewToggle={handlePreviewToggle}
                onDelete={handleDelete}
                onExportOne={handleExportOne}
                isExporting={isExporting}
              />
            </div>
          ))}
        </div>
      )}

      {/* Settings (collapsible) */}
      <Section
        title="Format & Quality"
        open={showSettings}
        toggle={() => setShowSettings(v => !v)}
      >
        <ExportSettingsPanel />
      </Section>

      {/* Metadata (collapsible, show tag count as hint) */}
      <Section
        title={`ID3 Metadata${settings.format === 'wav' ? ' (MP3 only)' : ''}`}
        open={showMetadata}
        toggle={() => setShowMetadata(v => !v)}
      >
        <MetadataForm />
      </Section>
    </div>
  )
}
