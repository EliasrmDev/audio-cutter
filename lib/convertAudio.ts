/**
 * lib/convertAudio.ts
 *
 * Client-side audio format conversion pipeline.
 * Validates input, decodes with Web Audio API, then delegates encoding
 * to the existing exportWorker (encodeWav / encodeMp3).
 *
 * All heavy work runs off the main thread — UI never freezes.
 */

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

export type ConvertFormat = 'mp3' | 'wav'

export interface ConvertOptions {
  targetFormat: ConvertFormat
  bitrate?: number   // kbps, MP3 only (default 128)
  bitDepth?: 16 | 24 // WAV only (default 16)
}

export interface AudioInfo {
  duration: number       // seconds
  sampleRate: number
  channels: number
  originalSize: number   // bytes
}

export interface ConversionResult {
  blob: Blob
  filename: string
  sizeBytes: number
}

// ── Serialised buffer (same shape as exportWorker.ts) ────────────────────────

interface SerializedBuffer {
  sampleRate: number
  numberOfChannels: number
  length: number
  channelData: Float32Array[]
}

function serializeBuffer(buf: AudioBuffer): SerializedBuffer {
  const channelData: Float32Array[] = []
  for (let i = 0; i < buf.numberOfChannels; i++) {
    channelData.push(buf.getChannelData(i).slice())
  }
  return {
    sampleRate: buf.sampleRate,
    numberOfChannels: buf.numberOfChannels,
    length: buf.length,
    channelData,
  }
}

// ── Worker comms helper ───────────────────────────────────────────────────────

function postToWorker<T>(
  worker: Worker,
  type: string,
  data: unknown,
  transferables: Transferable[],
  onProgress?: (p: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const handler = (event: MessageEvent) => {
      const msg = event.data
      if (msg.id !== id) return
      if (msg.type === 'progress') { onProgress?.(msg.progress); return }
      worker.removeEventListener('message', handler)
      if (msg.type === 'success') resolve(msg.data as T)
      else reject(new Error(msg.error ?? 'Worker error'))
    }

    worker.addEventListener('message', handler)
    worker.postMessage({ id, type, data }, transferables)
  })
}

// ── Validation ────────────────────────────────────────────────────────────────

const ACCEPTED_EXTENSIONS = ['wav', 'mp3', 'ogg'] as const

/**
 * Validates size, extension and magic bytes.
 * Async because reading magic bytes requires a FileReader / ArrayBuffer.
 */
export async function validateFile(file: File): Promise<{ valid: boolean; error?: string }> {
  if (file.size === 0) {
    return { valid: false, error: 'El archivo está vacío.' }
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `El archivo supera el límite de ${MAX_FILE_SIZE / 1024 / 1024} MB.` }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { valid: false, error: 'Formato no soportado. Acepta WAV, MP3 u OGG.' }
  }

  // Magic bytes check
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())

  const isWav =
    header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
    header[8] === 0x57 && header[9] === 0x41 && header[10] === 0x56 && header[11] === 0x45

  const isMp3 =
    (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) ||         // ID3 tag
    (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0)                          // sync bits

  const isOgg =
    header[0] === 0x4F && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53

  if (!isWav && !isMp3 && !isOgg) {
    return { valid: false, error: 'El archivo no parece ser un archivo de audio válido.' }
  }

  return { valid: true }
}

// ── Decode ────────────────────────────────────────────────────────────────────

/**
 * Decode the file using Web Audio API.
 * Returns AudioBuffer + AudioInfo. Caller must call ctx.close() when done.
 */
export async function decodeFile(
  file: File,
  onProgress?: (p: number) => void
): Promise<{ buffer: AudioBuffer; info: AudioInfo; ctx: AudioContext }> {
  onProgress?.(5)
  const arrayBuffer = await file.arrayBuffer()

  onProgress?.(30)
  const ctx = new AudioContext()
  const buffer = await ctx.decodeAudioData(arrayBuffer)
  onProgress?.(100)

  return {
    buffer,
    ctx,
    info: {
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      originalSize: file.size,
    },
  }
}

// ── Size estimation ───────────────────────────────────────────────────────────

export function estimateOutputSize(info: AudioInfo, opts: ConvertOptions): number {
  if (opts.targetFormat === 'mp3') {
    const bitrate = opts.bitrate ?? 128
    return Math.ceil(info.duration * bitrate * 1000 / 8) + 4096 // ~4 KB overhead
  }
  // WAV
  const bytesPerSample = ((opts.bitDepth ?? 16) / 8)
  return 44 + Math.ceil(info.duration * info.sampleRate * info.channels * bytesPerSample)
}

// ── Conversion pipeline ───────────────────────────────────────────────────────

export async function convertBuffer(
  buffer: AudioBuffer,
  ctx: AudioContext,
  opts: ConvertOptions,
  baseName: string,
  onProgress?: (p: number) => void
): Promise<ConversionResult> {
  const worker = new Worker(
    new URL('../workers/exportWorker.ts', import.meta.url),
    { type: 'module' }
  )

  try {
    onProgress?.(5)
    const serialized = serializeBuffer(buffer)
    const transferables = serialized.channelData.map(c => c.buffer as Transferable)

    let encoded: ArrayBuffer

    if (opts.targetFormat === 'wav') {
      onProgress?.(10)
      encoded = await postToWorker<ArrayBuffer>(
        worker,
        'encodeWav',
        { serializedBuffer: serialized, bitDepth: opts.bitDepth ?? 16 },
        transferables,
        p => onProgress?.(10 + p * 0.85)
      )
    } else {
      onProgress?.(10)
      encoded = await postToWorker<ArrayBuffer>(
        worker,
        'encodeMp3',
        { serializedBuffer: serialized, bitrate: opts.bitrate ?? 128 },
        transferables,
        p => onProgress?.(10 + p * 0.85)
      )
    }

    onProgress?.(97)

    const ext = opts.targetFormat === 'mp3' ? 'mp3' : 'wav'
    const mimeType = opts.targetFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav'
    const blob = new Blob([encoded], { type: mimeType })
    const safe = baseName.replace(/[^a-z0-9\-]/gi, '_').toLowerCase().replace(/^_+|_+$/g, '') || 'audio'
    const filename = `${safe}_converted.${ext}`

    onProgress?.(100)
    return { blob, filename, sizeBytes: blob.size }
  } finally {
    worker.terminate()
  }
}
