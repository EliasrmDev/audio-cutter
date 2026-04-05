/**
 * Audio processing Web Worker
 * Handles heavy audio processing operations to prevent UI blocking
 *
 * AudioBuffer CANNOT be transferred or cloned via postMessage.
 * All audio data is serialised as plain { sampleRate, numberOfChannels, length, channelData: Float32Array[] }
 * objects. The main thread serialises before sending and reconstructs AudioBuffer after receiving.
 */

interface AudioWorkerMessage {
  id: string
  type: 'generateWaveform' | 'cutAudio' | 'processAudio' | 'export'
  data: any
}

interface AudioWorkerResponse {
  id: string
  type: 'success' | 'error' | 'progress'
  data?: any
  error?: string
  progress?: number
}

/** Plain representation of an AudioBuffer that survives postMessage */
interface SerializedAudioBuffer {
  sampleRate: number
  numberOfChannels: number
  length: number
  channelData: Float32Array[]
}

// ── Audio processing helpers ─────────────────────────────────────────────────

function generateWaveformData(
  buf: SerializedAudioBuffer,
  options: { bars?: number } = {}
) {
  const bars = options.bars || 1000
  const { channels, sampleRate, length, numberOfChannels } = { channels: buf.numberOfChannels, ...buf }

  const samplesPerBar = Math.floor(length / bars)
  const peaks: Float32Array[] = []

  for (let channel = 0; channel < numberOfChannels; channel++) {
    const channelData = buf.channelData[channel]
    const channelPeaks = new Float32Array(bars)

    for (let i = 0; i < bars; i++) {
      const start = i * samplesPerBar
      const end = Math.min(start + samplesPerBar, length)

      let max = 0
      for (let j = start; j < end; j++) {
        const sample = Math.abs(channelData[j])
        if (sample > max) max = sample
      }

      channelPeaks[i] = max
    }

    peaks.push(channelPeaks)
  }

  return { peaks, length: bars, sampleRate, channels: numberOfChannels }
}

function cutAudioBuffer(
  buf: SerializedAudioBuffer,
  selection: { start: number; end: number }
): SerializedAudioBuffer {
  const { start, end } = selection
  const { sampleRate, numberOfChannels, length } = buf

  const startSample = Math.floor(start * sampleRate)
  const endSample = Math.floor(end * sampleRate)
  const cutLength = endSample - startSample

  if (cutLength <= 0 || startSample >= length || endSample > length) {
    throw new Error('Invalid selection range')
  }

  const channelData: Float32Array[] = []
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const src = buf.channelData[channel]
    const dst = new Float32Array(cutLength)
    for (let i = 0; i < cutLength; i++) {
      dst[i] = src[startSample + i]
    }
    channelData.push(dst)
  }

  return { sampleRate, numberOfChannels, length: cutLength, channelData }
}

function processAudioBuffer(
  buf: SerializedAudioBuffer,
  settings: { fadeIn?: number; fadeOut?: number; normalize?: boolean }
): SerializedAudioBuffer {
  const { sampleRate, numberOfChannels, length } = buf
  const channelData: Float32Array[] = []

  for (let channel = 0; channel < numberOfChannels; channel++) {
    const src = buf.channelData[channel]
    const out = new Float32Array(src)

    if (settings.fadeIn && settings.fadeIn > 0) {
      const fadeSamples = Math.floor(settings.fadeIn * sampleRate)
      for (let i = 0; i < Math.min(fadeSamples, length); i++) {
        out[i] *= i / fadeSamples
      }
    }

    if (settings.fadeOut && settings.fadeOut > 0) {
      const fadeSamples = Math.floor(settings.fadeOut * sampleRate)
      const fadeStart = Math.max(0, length - fadeSamples)
      for (let i = fadeStart; i < length; i++) {
        out[i] *= (length - i) / fadeSamples
      }
    }

    if (settings.normalize) {
      let maxSample = 0
      for (let i = 0; i < length; i++) maxSample = Math.max(maxSample, Math.abs(out[i]))
      if (maxSample > 0) {
        const gain = 0.95 / maxSample
        for (let i = 0; i < length; i++) out[i] *= gain
      }
    }

    channelData.push(out)
  }

  return { sampleRate, numberOfChannels, length, channelData }
}

function audioBufferToWav(buf: SerializedAudioBuffer): ArrayBuffer {
  const { length, sampleRate, numberOfChannels: channels, channelData } = buf
  const arrayBuffer = new ArrayBuffer(44 + length * channels * 2)
  const view = new DataView(arrayBuffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + length * channels * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, length * channels * 2, true)

  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]))
      view.setInt16(offset, sample * 0x7FFF, true)
      offset += 2
    }
  }

  return arrayBuffer
}

// ── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async function(event: MessageEvent<AudioWorkerMessage>) {
  const { id, type, data } = event.data

  const sendResponse = (response: Omit<AudioWorkerResponse, 'id'>) => {
    self.postMessage({ id, ...response })
  }
  const sendProgress = (progress: number) => sendResponse({ type: 'progress', progress })

  try {
    switch (type) {
      case 'generateWaveform': {
        const { serializedBuffer, options = {} } = data
        sendProgress(10)
        const waveformData = generateWaveformData(serializedBuffer, options)
        sendProgress(100)
        // Transfer Float32Array buffers for zero-copy return
        const transferables = waveformData.peaks.map(p => p.buffer) as Transferable[]
        self.postMessage({ id, type: 'success', data: waveformData }, { transfer: transferables })
        break
      }

      case 'cutAudio': {
        const { serializedBuffer, selection } = data
        sendProgress(25)
        const cutBuf = cutAudioBuffer(serializedBuffer, selection)
        sendProgress(100)
        const transferables = cutBuf.channelData.map(c => c.buffer) as Transferable[]
        self.postMessage({ id, type: 'success', data: cutBuf }, { transfer: transferables })
        break
      }

      case 'processAudio': {
        const { serializedBuffer, settings } = data
        sendProgress(10)
        const processed = processAudioBuffer(serializedBuffer, settings)
        sendProgress(100)
        const transferables = processed.channelData.map(c => c.buffer) as Transferable[]
        self.postMessage({ id, type: 'success', data: processed }, { transfer: transferables })
        break
      }

      case 'export': {
        const { serializedBuffer, format = 'wav' } = data
        sendProgress(25)
        let result: ArrayBuffer
        if (format === 'wav') {
          result = audioBufferToWav(serializedBuffer)
        } else {
          throw new Error(`Unsupported export format: ${format}`)
        }
        sendProgress(100)
        self.postMessage({ id, type: 'success', data: result }, { transfer: [result] as Transferable[] })
        break
      }

      default:
        throw new Error(`Unknown operation type: ${type}`)
    }
  } catch (error) {
    sendResponse({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })
  }
}

export {}
