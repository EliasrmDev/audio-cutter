/**
 * Export Worker — handles CPU-heavy audio encoding off the main thread.
 *
 * Supported operations:
 *   encodeWav   – PCM → WAV (16-bit or 24-bit)
 *   encodeMp3   – PCM → MP3 via lamejs (CBR)
 *   resample    – naive linear interpolation inside worker (low quality but instant)
 *
 * AudioBuffer cannot cross postMessage; all data arrives as SerializedAudioBuffer.
 */

import { Mp3Encoder } from '@breezystack/lamejs'

// ── Types ────────────────────────────────────────────────────────────────────

interface SerializedAudioBuffer {
  sampleRate: number
  numberOfChannels: number
  length: number
  channelData: Float32Array[]
}

interface WorkerMessage {
  id: string
  type: 'encodeWav' | 'encodeMp3' | 'applyProcessing'
  data: any
}

interface WorkerResponse {
  id: string
  type: 'success' | 'error' | 'progress'
  data?: any
  error?: string
  progress?: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function send(id: string, response: Omit<WorkerResponse, 'id'>) {
  self.postMessage({ id, ...response })
}

function progress(id: string, value: number) {
  send(id, { type: 'progress', progress: value })
}

// ── Processing ───────────────────────────────────────────────────────────────

function applyProcessing(
  buf: SerializedAudioBuffer,
  opts: { normalize?: boolean }
): SerializedAudioBuffer {
  const { sampleRate, numberOfChannels, length } = buf
  const channelData: Float32Array[] = []

  // Peak for normalisation (across all channels)
  let peak = 0
  if (opts.normalize) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const src = buf.channelData[ch]
      for (let i = 0; i < length; i++) {
        const abs = Math.abs(src[i])
        if (abs > peak) peak = abs
      }
    }
  }
  const normGain = opts.normalize && peak > 0 ? 0.95 / peak : 1

  for (let ch = 0; ch < numberOfChannels; ch++) {
    const src = buf.channelData[ch]
    const dst = new Float32Array(src)
    if (normGain !== 1) {
      for (let i = 0; i < length; i++) dst[i] *= normGain
    }
    channelData.push(dst)
  }

  return { sampleRate, numberOfChannels, length, channelData }
}

// ── WAV encoding ─────────────────────────────────────────────────────────────

function encodeWav(buf: SerializedAudioBuffer, bitDepth: 16 | 24): ArrayBuffer {
  const { sampleRate, numberOfChannels: channels, length, channelData } = buf
  const bytesPerSample = bitDepth === 24 ? 3 : 2
  const byteRate  = sampleRate * channels * bytesPerSample
  const blockAlign = channels * bytesPerSample
  const dataSize  = length * channels * bytesPerSample

  const ab   = new ArrayBuffer(44 + dataSize)
  const view = new DataView(ab)

  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  str(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)                   // chunk size
  view.setUint16(20, 1, true)                    // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  str(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44

  if (bitDepth === 16) {
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < channels; ch++) {
        const s = Math.max(-1, Math.min(1, channelData[ch][i]))
        view.setInt16(offset, s * 0x7fff, true)
        offset += 2
      }
    }
  } else {
    // 24-bit
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < channels; ch++) {
        const s = Math.max(-1, Math.min(1, channelData[ch][i]))
        const v = Math.round(s * 8388607) // 2^23 - 1
        view.setUint8(offset,     v & 0xff)
        view.setUint8(offset + 1, (v >> 8)  & 0xff)
        view.setUint8(offset + 2, (v >> 16) & 0xff)
        offset += 3
      }
    }
  }

  return ab
}

// ── MP3 encoding (lamejs) ─────────────────────────────────────────────────────

function float32ToInt16(src: Float32Array): Int16Array {
  const dst = new Int16Array(src.length)
  for (let i = 0; i < src.length; i++) {
    const s = Math.max(-1, Math.min(1, src[i]))
    dst[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return dst
}

function encodeMp3(
  id: string,
  buf: SerializedAudioBuffer,
  bitrate: number
): Uint8Array {
  const { sampleRate, numberOfChannels, length, channelData } = buf
  const channels = Math.min(numberOfChannels, 2) as 1 | 2

  const encoder = new Mp3Encoder(channels, sampleRate, bitrate)
  const chunkSize = 1152   // one MP3 frame
  const parts: Uint8Array[] = []

  // Convert Float32 → Int16 for all channels
  const pcm = channelData.slice(0, channels).map(float32ToInt16)

  const totalChunks = Math.ceil(length / chunkSize)

  for (let i = 0; i < length; i += chunkSize) {
    const end = Math.min(i + chunkSize, length)
    const left  = pcm[0].subarray(i, end)
    const right = channels === 2 ? pcm[1].subarray(i, end) : undefined

    const encoded: Uint8Array = right ? encoder.encodeBuffer(left, right) : encoder.encodeBuffer(left)
    if (encoded.length > 0) parts.push(encoded)

    const chunkIdx = Math.floor(i / chunkSize)
    if (chunkIdx % 20 === 0) {
      progress(id, Math.round(10 + (chunkIdx / totalChunks) * 85))
    }
  }

  const flushed: Uint8Array = encoder.flush()
  if (flushed.length > 0) parts.push(flushed)

  // Concatenate all parts into a single Uint8Array
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

// ── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, data } = event.data

  try {
    switch (type) {
      case 'applyProcessing': {
        const { serializedBuffer, normalize = false } = data
        progress(id, 10)
        const processed = applyProcessing(serializedBuffer, { normalize })
        progress(id, 100)
        const transferables = processed.channelData.map(c => c.buffer) as Transferable[]
        self.postMessage({ id, type: 'success', data: processed }, { transfer: transferables })
        break
      }

      case 'encodeWav': {
        const { serializedBuffer, bitDepth = 16 } = data
        progress(id, 10)
        const result = encodeWav(serializedBuffer, bitDepth)
        progress(id, 100)
        self.postMessage({ id, type: 'success', data: result }, { transfer: [result] })
        break
      }

      case 'encodeMp3': {
        const { serializedBuffer, bitrate = 192 } = data
        progress(id, 5)
        const mp3Bytes = encodeMp3(id, serializedBuffer, bitrate)
        const resultBuffer = mp3Bytes.buffer.slice(
          mp3Bytes.byteOffset,
          mp3Bytes.byteOffset + mp3Bytes.byteLength
        )
        progress(id, 100)
        self.postMessage({ id, type: 'success', data: resultBuffer }, { transfer: [resultBuffer] })
        break
      }

      default:
        throw new Error(`Unknown export operation: ${type}`)
    }
  } catch (err) {
    send(id, {
      type: 'error',
      error: err instanceof Error ? err.message : 'Unknown export error',
    })
  }
}

export {}
