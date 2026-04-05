/**
 * lib/audioExporter.ts
 *
 * Main-thread orchestration for the advanced export pipeline:
 *   1. Resample (OfflineAudioContext — high quality)
 *   2. Optionally concatenate segments
 *   3. Send to exportWorker for encoding (WAV or MP3)
 *   4. Apply ID3 tags (MP3 only, on main thread via browser-id3-writer)
 *   5. Return { blob, filename }
 *
 * All heavy encoding runs in exportWorker.ts to keep the UI responsive.
 */

import { ID3Writer } from 'browser-id3-writer'
import type { AudioSegment } from '@/types/audio'
import type {
  ExportSettings,
  ExportMetadata,
  ExportResultFile,
  ExportFormat,
} from '@/types/export'

// ── Serialisation (same pattern as useAudioWorker) ───────────────────────────

export interface SerializedAudioBuffer {
  sampleRate: number
  numberOfChannels: number
  length: number
  channelData: Float32Array[]
}

function serializeBuffer(buffer: AudioBuffer): SerializedAudioBuffer {
  const channelData: Float32Array[] = []
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channelData.push(buffer.getChannelData(i).slice())
  }
  return {
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    channelData,
  }
}

// ── Worker wrapper ────────────────────────────────────────────────────────────

type WorkerOpType = 'applyProcessing' | 'encodeWav' | 'encodeMp3'

function postToExportWorker<T>(
  worker: Worker,
  type: WorkerOpType,
  data: any,
  transferables: Transferable[],
  onProgress?: (p: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const handler = (event: MessageEvent) => {
      const msg = event.data
      if (msg.id !== id) return

      switch (msg.type) {
        case 'progress':
          onProgress?.(msg.progress)
          break
        case 'success':
          worker.removeEventListener('message', handler)
          resolve(msg.data as T)
          break
        case 'error':
          worker.removeEventListener('message', handler)
          reject(new Error(msg.error ?? 'Export worker error'))
          break
      }
    }

    worker.addEventListener('message', handler)
    worker.postMessage({ id, type, data }, transferables)
  })
}

// ── Resample (OfflineAudioContext) ────────────────────────────────────────────

export async function resampleBuffer(
  buffer: AudioBuffer,
  targetSampleRate: number,
  audioContext: BaseAudioContext
): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetSampleRate) return buffer

  const duration = buffer.duration
  const offlineCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    Math.ceil(duration * targetSampleRate),
    targetSampleRate
  )

  const source = offlineCtx.createBufferSource()
  source.buffer = buffer
  source.connect(offlineCtx.destination)
  source.start(0)

  return offlineCtx.startRendering()
}

// ── Concatenate segments ──────────────────────────────────────────────────────

export async function concatenateBuffers(
  buffers: AudioBuffer[],
  audioContext: AudioContext
): Promise<AudioBuffer> {
  if (buffers.length === 0) throw new Error('No buffers to concatenate')
  if (buffers.length === 1) return buffers[0]

  const targetSR = buffers[0].sampleRate
  const channels = buffers[0].numberOfChannels

  // Ensure all buffers have the same sample rate
  const resampled = await Promise.all(
    buffers.map(b => resampleBuffer(b, targetSR, audioContext))
  )

  const totalLength = resampled.reduce((sum, b) => sum + b.length, 0)
  const output = audioContext.createBuffer(channels, totalLength, targetSR)

  let offset = 0
  for (const buf of resampled) {
    for (let ch = 0; ch < channels; ch++) {
      const outData  = output.getChannelData(ch)
      const srcData  = buf.getChannelData(ch)
      outData.set(srcData, offset)
    }
    offset += buf.length
  }

  return output
}

// ── ID3 tagging ───────────────────────────────────────────────────────────────

function applyId3Tags(mp3Buffer: ArrayBuffer, meta: ExportMetadata): Blob {
  const writer = new ID3Writer(mp3Buffer)

  if (meta.title)  writer.setFrame('TIT2', meta.title)
  if (meta.artist) writer.setFrame('TPE1', [meta.artist])
  if (meta.album)  writer.setFrame('TALB', meta.album)
  if (meta.year)   (writer as any).setFrame('TYER', meta.year)
  if (meta.genre)  writer.setFrame('TCON', [meta.genre])

  if (meta.coverArt) {
    try {
      const [header, b64] = meta.coverArt.split(',')
      const mimeMatch = header.match(/data:(image\/[^;]+)/)
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg'
      const binary = atob(b64)
      const coverBuffer = new ArrayBuffer(binary.length)
      const view = new Uint8Array(coverBuffer)
      for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i)
      writer.setFrame('APIC', {
        type: 3,     // Front cover
        data: coverBuffer,
        description: 'Cover',
        useUnicodeEncoding: false,
        mimeType: mime,
      } as any)
    } catch {
      // Cover art encoding failed — skip it silently
    }
  }

  writer.addTag()
  return writer.getBlob()
}

// ── Safe sanitize filename ────────────────────────────────────────────────────

function sanitize(name: string): string {
  return (
    name
      .replace(/[^a-z0-9\-]/gi, '_')
      .toLowerCase()
      .replace(/^_+|_+$/g, '') || 'segment'
  )
}

// ── Main export pipeline ──────────────────────────────────────────────────────

export interface ExportOneOptions {
  worker: Worker
  buffer: AudioBuffer
  settings: ExportSettings
  metadata: ExportMetadata
  filename: string       // base name without extension
  audioContext: AudioContext
  onProgress?: (p: number) => void
}

export async function exportOneBuffer({
  worker,
  buffer,
  settings,
  metadata,
  filename,
  audioContext,
  onProgress,
}: ExportOneOptions): Promise<{ blob: Blob; filename: string }> {
  // 1. Resample if needed
  onProgress?.(5)
  const resampled = await resampleBuffer(buffer, settings.sampleRate, audioContext)

  // 2. Apply fades + normalisation in the worker
  onProgress?.(10)
  const serialized = serializeBuffer(resampled)
  const transferables = serialized.channelData.map(c => c.buffer as Transferable)

  const processed = await postToExportWorker<SerializedAudioBuffer>(
    worker,
    'applyProcessing',
    {
      serializedBuffer: serialized,
      normalize: settings.normalize,
    },
    transferables,
    p => onProgress?.(10 + p * 0.1)  // 10 → 20
  )

  // 3. Encode
  onProgress?.(20)
  const encTransferables = processed.channelData.map(c => c.buffer as Transferable)
  let encoded: ArrayBuffer

  if (settings.format === 'wav') {
    encoded = await postToExportWorker<ArrayBuffer>(
      worker,
      'encodeWav',
      { serializedBuffer: processed, bitDepth: settings.bitDepth },
      encTransferables,
      p => onProgress?.(20 + p * 0.75)  // 20 → 95
    )
  } else {
    // MP3
    encoded = await postToExportWorker<ArrayBuffer>(
      worker,
      'encodeMp3',
      { serializedBuffer: processed, bitrate: settings.bitrate },
      encTransferables,
      p => onProgress?.(20 + p * 0.75)  // 20 → 95
    )
  }

  // 4. ID3 tags (MP3 only)
  onProgress?.(96)
  let finalBuffer = encoded
  const hasAnyMeta = (m: ExportMetadata) =>
    Object.entries(m).some(([k, v]) => k !== 'coverArt' && Boolean(v))
  if (settings.format === 'mp3' && (hasAnyMeta(metadata) || metadata.coverArt)) {
    const taggedBlob = applyId3Tags(encoded, metadata)
    const ext = 'mp3'
    const mimeType = 'audio/mpeg'
    const finalName = `${sanitize(filename)}.${ext}`
    onProgress?.(100)
    return { blob: taggedBlob, filename: finalName }
  }

  onProgress?.(100)

  const ext = settings.format === 'mp3' ? 'mp3' : 'wav'
  const mimeType = settings.format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
  const blob = new Blob([finalBuffer], { type: mimeType })
  const finalName = `${sanitize(filename)}.${ext}`

  return { blob, filename: finalName }
}

// ── Full export run (individual or concatenated) ──────────────────────────────

export interface RunExportOptions {
  segments: AudioSegment[]
  settings: ExportSettings
  metadata: ExportMetadata
  audioContext: AudioContext
  onSegmentProgress: (segIdx: number, progress: number) => void
  onSegmentDone: (result: ExportResultFile) => void
  onError: (segIdx: number, error: string) => void
}

export async function runExport(opts: RunExportOptions): Promise<ExportResultFile[]> {
  const { segments, settings, metadata, audioContext } = opts

  const worker = new Worker(
    new URL('../workers/exportWorker.ts', import.meta.url),
    { type: 'module' }
  )

  const results: ExportResultFile[] = []

  try {
    if (settings.exportMode === 'concatenated') {
      // Build one buffer from all segments in order
      const buffers = segments.map(s => {
        if (!s.buffer) throw new Error(`Segment "${s.name}" has no audio buffer`)
        return s.buffer
      })

      const concatBuffer = await concatenateBuffers(buffers, audioContext)
      const firstSeg = segments[0]
      const baseName = firstSeg.name.replace(/\s+/g, '_')

      const { blob, filename } = await exportOneBuffer({
        worker,
        buffer: concatBuffer,
        settings,
        metadata,
        filename: baseName,
        audioContext,
        onProgress: p => opts.onSegmentProgress(0, p),
      })

      const url = URL.createObjectURL(blob)
      const result: ExportResultFile = {
        segmentId: segments.map(s => s.id).join('+'),
        name: filename,
        blob,
        url,
        format: settings.format,
        sizeBytes: blob.size,
      }
      results.push(result)
      opts.onSegmentDone(result)
    } else {
      // Individual export
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        if (!seg.buffer) {
          opts.onError(i, `Segment "${seg.name}" has no audio buffer`)
          continue
        }

        try {
          const { blob, filename } = await exportOneBuffer({
            worker,
            buffer: seg.buffer,
            settings,
            metadata,
            filename: seg.name,
            audioContext,
            onProgress: p => opts.onSegmentProgress(i, p),
          })

          const url = URL.createObjectURL(blob)
          const result: ExportResultFile = {
            segmentId: seg.id,
            name: filename,
            blob,
            url,
            format: settings.format,
            sizeBytes: blob.size,
          }
          results.push(result)
          opts.onSegmentDone(result)
        } catch (err) {
          opts.onError(i, err instanceof Error ? err.message : 'Encoding failed')
        }
      }
    }
  } finally {
    worker.terminate()
  }

  return results
}

// ── Download helper ───────────────────────────────────────────────────────────

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
