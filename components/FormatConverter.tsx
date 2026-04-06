'use client'

import React, { useCallback, useId, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Upload, FileAudio, RotateCcw, Download, AlertCircle, CheckCircle2 } from 'lucide-react'
import { CompressionSettings } from './CompressionSettings'
import {
  validateFile,
  decodeFile,
  estimateOutputSize,
  convertBuffer,
  MAX_FILE_SIZE,
  type ConvertFormat,
  type ConvertOptions,
  type AudioInfo,
  type ConversionResult,
} from '@/lib/convertAudio'
import { formatBytes, triggerDownload } from '@/lib/audioExporter'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | { name: 'idle' }
  | { name: 'decoding'; progress: number }
  | { name: 'ready'; info: AudioInfo; buffer: AudioBuffer; ctx: AudioContext }
  | { name: 'converting'; progress: number }
  | { name: 'done'; result: ConversionResult; info: AudioInfo }
  | { name: 'error'; message: string }

// ── Component ─────────────────────────────────────────────────────────────────

export function FormatConverter() {
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const [outputFormat, setOutputFormat] = useState<ConvertFormat>('mp3')
  const [bitrate, setBitrate] = useState(128)
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  // ── Computed size estimate ─────────────────────────────────────────────────
  const estimatedBytes =
    phase.name === 'ready'
      ? estimateOutputSize(phase.info, { targetFormat: outputFormat, bitrate })
      : null

  // ── File handling ──────────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    setFileName(file.name.replace(/\.[^.]+$/, ''))

    const validation = await validateFile(file)
    if (!validation.valid) {
      setPhase({ name: 'error', message: validation.error! })
      return
    }

    setPhase({ name: 'decoding', progress: 0 })

    try {
      const { buffer, ctx, info } = await decodeFile(file, (p) =>
        setPhase({ name: 'decoding', progress: p })
      )
      setPhase({ name: 'ready', info, buffer, ctx })
    } catch {
      setPhase({ name: 'error', message: 'No se pudo decodificar el archivo de audio.' })
    }
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      // Reset input so the same file can be re-selected
      e.target.value = ''
    },
    [processFile]
  )

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragging(false), [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  // ── Conversion ─────────────────────────────────────────────────────────────
  const handleConvert = useCallback(async () => {
    if (phase.name !== 'ready') return

    const opts: ConvertOptions = {
      targetFormat: outputFormat,
      bitrate,
      bitDepth: 16,
    }

    const savedInfo = phase.info
    const savedBuffer = phase.buffer
    const savedCtx = phase.ctx

    setPhase({ name: 'converting', progress: 0 })

    try {
      const result = await convertBuffer(savedBuffer, savedCtx, opts, fileName, (p) =>
        setPhase({ name: 'converting', progress: p })
      )
      // Release AudioContext only after conversion is done
      savedCtx.close()
      setPhase({ name: 'done', result, info: savedInfo })
    } catch (err) {
      savedCtx.close()
      setPhase({
        name: 'error',
        message: err instanceof Error ? err.message : 'Error durante la conversión.',
      })
    }
  }, [phase, outputFormat, bitrate, fileName])

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (phase.name !== 'done') return
    triggerDownload(phase.result.blob, phase.result.filename)
  }, [phase])

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (phase.name === 'ready') phase.ctx.close()
    setPhase({ name: 'idle' })
    setFileName('')
  }, [phase])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-border bg-background-secondary overflow-hidden">

      {/* ── Dropzone ─────── */}
      {(phase.name === 'idle' || phase.name === 'error') && (
        <div
          ref={dropRef}
          role="region"
          aria-label="Zona de carga de archivo de audio"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={clsx(
            'flex flex-col items-center justify-center gap-4 px-8 py-12 transition-colors cursor-pointer',
            isDragging
              ? 'bg-primary/10 border-2 border-dashed border-primary'
              : 'border-2 border-dashed border-border hover:border-primary/50'
          )}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
          tabIndex={0}
          aria-describedby="drop-desc"
        >
          <div className="p-4 rounded-full bg-primary/10">
            <Upload className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>
          <div className="text-center space-y-1" id="drop-desc">
            <p className="font-medium text-foreground">
              {isDragging ? 'Suelta el archivo aquí' : 'Arrastra un archivo de audio'}
            </p>
            <p className="text-sm text-foreground-muted">
              o haz clic para seleccionar · WAV, MP3, OGG · máx {MAX_FILE_SIZE / 1024 / 1024} MB
            </p>
          </div>

          {phase.name === 'error' && (
            <div
              role="alert"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {phase.message}
            </div>
          )}

          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept=".wav,.mp3,.ogg,audio/wav,audio/mpeg,audio/ogg"
            className="sr-only"
            aria-label="Seleccionar archivo de audio"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* ── Decoding progress ─── */}
      {phase.name === 'decoding' && (
        <div className="flex flex-col items-center justify-center gap-3 px-8 py-12" role="status" aria-live="polite">
          <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-foreground-secondary">Decodificando audio… {phase.progress}%</p>
        </div>
      )}

      {/* ── Ready: settings + convert ─── */}
      {phase.name === 'ready' && (
        <div className="p-6 space-y-6">
          {/* File info */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border">
            <FileAudio className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
              <p className="text-[11px] text-foreground-muted tabular-nums">
                {phase.info.duration.toFixed(2)} s &nbsp;·&nbsp;
                {phase.info.sampleRate / 1000} kHz &nbsp;·&nbsp;
                {phase.info.channels === 1 ? 'Mono' : 'Estéreo'} &nbsp;·&nbsp;
                {formatBytes(phase.info.originalSize)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              aria-label="Cambiar archivo"
              className="p-1.5 rounded text-foreground-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Format selector */}
          <fieldset>
            <legend className="text-xs font-medium text-foreground-secondary mb-2">
              Formato de salida
            </legend>
            <div className="flex gap-2" role="radiogroup" aria-label="Formato de salida">
              {(['mp3', 'wav'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  role="radio"
                  aria-checked={outputFormat === fmt}
                  aria-label={fmt === 'mp3' ? 'MP3 — comprimido' : 'WAV — sin pérdidas'}
                  onClick={() => setOutputFormat(fmt)}
                  className={clsx(
                    'flex-1 py-2 rounded-lg text-sm font-semibold uppercase tracking-wider transition-colors',
                    'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                    outputFormat === fmt
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border text-foreground-secondary hover:border-primary/50'
                  )}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Compression settings (MP3 only) */}
          {outputFormat === 'mp3' && (
            <CompressionSettings
              bitrate={bitrate}
              onChange={setBitrate}
              estimatedBytes={estimatedBytes}
            />
          )}

          {/* WAV size estimate */}
          {outputFormat === 'wav' && estimatedBytes !== null && (
            <p className="text-[11px] text-foreground-muted">
              Tamaño estimado (WAV 16-bit):{' '}
              <span className="font-medium text-foreground-secondary">{formatBytes(estimatedBytes)}</span>
            </p>
          )}

          {/* Convert button */}
          <button
            type="button"
            onClick={handleConvert}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold
              hover:brightness-110 active:scale-[0.98] transition-all
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Convertir a {outputFormat.toUpperCase()}
          </button>
        </div>
      )}

      {/* ── Converting progress ─── */}
      {phase.name === 'converting' && (
        <div className="px-6 py-10 space-y-4" role="status" aria-live="polite" aria-label={`Convirtiendo: ${phase.progress}%`}>
          <p className="text-sm text-center text-foreground-secondary">
            Convirtiendo… {phase.progress}%
          </p>
          <div className="w-full h-2 rounded-full bg-border overflow-hidden" aria-hidden="true">
            <div
              className="h-full bg-primary rounded-full transition-all duration-200"
              style={{ width: `${phase.progress}%` }}
            />
          </div>
          <p className="text-[11px] text-center text-foreground-muted">
            El audio se procesa en segundo plano — la UI no se congela.
          </p>
        </div>
      )}

      {/* ── Done ─── */}
      {phase.name === 'done' && (
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{phase.result.filename}</p>
              <p className="text-[11px] text-foreground-muted tabular-nums">
                {formatBytes(phase.result.sizeBytes)} &nbsp;·&nbsp;
                {phase.info.duration.toFixed(2)} s
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg
                bg-primary text-primary-foreground font-semibold
                hover:brightness-110 active:scale-[0.98] transition-all
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Descargar
            </button>
            <button
              type="button"
              onClick={handleReset}
              aria-label="Convertir otro archivo"
              className="px-4 py-2.5 rounded-lg border border-border text-foreground-secondary
                hover:border-primary/50 hover:text-foreground transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
