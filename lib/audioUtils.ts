import {
  AudioFile,
  AudioSelection,
  WaveformData,
  AudioError,
  AudioErrorCode,
  AudioProcessingSettings
} from '@/types/audio'

// Audio configuration constants
export const AUDIO_CONFIG = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  supportedFormats: ['mp3', 'wav', 'ogg', 'flac', 'm4a'] as const,
  waveformBars: 512,
  sampleSize: 1024,
  defaultQuality: 0.8
} as const

// Note: AudioError is now imported as a class from types/audio

/**
 * Check if Web Audio API is supported
 */
export function isWebAudioSupported(): boolean {
  return typeof window !== 'undefined' &&
         (typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined')
}

/**
 * Create and initialize audio context
 */
export async function createAudioContext(): Promise<AudioContext> {
  if (!isWebAudioSupported()) {
    throw new AudioError('Web Audio API is not supported in this browser', 'BROWSER_UNSUPPORTED')
  }

  try {
    const AudioContextClass = AudioContext || (window as any).webkitAudioContext
    const context = new AudioContextClass()

    // Resume context if suspended (browser autoplay policy)
    if (context.state === 'suspended') {
      await context.resume()
    }

    return context
  } catch (error) {
    throw new AudioError(
      'Failed to create audio context',
      'BROWSER_UNSUPPORTED',
      error as Error
    )
  }
}

/**
 * Validate audio file before processing
 */
export function validateAudioFile(file: File): { isValid: boolean; error?: string } {
  // Check file size
  if (file.size > AUDIO_CONFIG.maxFileSize) {
    return {
      isValid: false,
      error: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowed size (${AUDIO_CONFIG.maxFileSize / 1024 / 1024}MB)`
    }
  }

  // Check file type
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!extension || !AUDIO_CONFIG.supportedFormats.includes(extension as any)) {
    return {
      isValid: false,
      error: `Unsupported file format. Supported formats: ${AUDIO_CONFIG.supportedFormats.join(', ')}`
    }
  }

  return { isValid: true }
}

/**
 * Load and decode audio file using Web Audio API
 * Replaces the broken file reading logic from the original implementation
 */
export async function decodeAudioFile(
  file: File,
  audioContext: AudioContext,
  onProgress?: (progress: number) => void
): Promise<{ audioFile: AudioFile; audioBuffer: AudioBuffer }> {

  // Validate file first
  const validation = validateAudioFile(file)
  if (!validation.isValid) {
    throw new AudioError(validation.error!, 'UNSUPPORTED_FORMAT')
  }

  try {
    onProgress?.(10)

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer()
    onProgress?.(50)

    // Decode audio data using Web Audio API (much more reliable than the original approach)
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    onProgress?.(90)

    // Create audio file info
    const audioFile: AudioFile = {
      file,
      name: file.name,
      size: file.size,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      format: file.name.split('.').pop()?.toLowerCase() as any,
      buffer: audioBuffer,
      url: URL.createObjectURL(file)
    }

    onProgress?.(100)

    return { audioFile, audioBuffer }

  } catch (error) {
    throw new AudioError(
      'Failed to decode audio file. The file may be corrupted or in an unsupported format.',
      'DECODE_FAILED',
      error as Error
    )
  }
}

/**
 * Generate waveform data from audio buffer
 * Creates visualization data for the waveform component
 */
export function generateWaveformData(
  audioBuffer: AudioBuffer,
  options: {
    bars?: number
    sampleRate?: number
  } = {}
): WaveformData {
  const bars = options.bars || AUDIO_CONFIG.waveformBars
  const channels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const length = audioBuffer.length

  // Calculate how many samples per bar
  const samplesPerBar = Math.floor(length / bars)

  const peaks: Float32Array[] = []

  // Process each channel
  for (let channel = 0; channel < channels; channel++) {
    const channelData = audioBuffer.getChannelData(channel)
    const channelPeaks = new Float32Array(bars)

    for (let i = 0; i < bars; i++) {
      const start = i * samplesPerBar
      const end = Math.min(start + samplesPerBar, length)

      let max = 0

      // Find peak value in this segment
      for (let j = start; j < end; j++) {
        const sample = Math.abs(channelData[j])
        if (sample > max) {
          max = sample
        }
      }

      channelPeaks[i] = max
    }

    peaks.push(channelPeaks)
  }

  return {
    peaks,
    length: bars,
    sampleRate,
    channels
  }
}

/**
 * Cut audio buffer to create a segment
 * Replaces the broken Blob.slice approach with proper AudioBuffer manipulation
 */
export function cutAudioBuffer(
  audioBuffer: AudioBuffer,
  selection: AudioSelection,
  audioContext: AudioContext
): AudioBuffer {
  const { start, end } = selection
  const sampleRate = audioBuffer.sampleRate
  const channels = audioBuffer.numberOfChannels

  // Calculate sample positions
  const startSample = Math.floor(start * sampleRate)
  const endSample = Math.floor(end * sampleRate)
  const length = endSample - startSample

  if (length <= 0 || startSample >= audioBuffer.length || endSample > audioBuffer.length) {
    throw new AudioError(
      'Invalid selection range',
      'INVALID_SELECTION'
    )
  }

  try {
    // Create new audio buffer for the cut segment
    const cutBuffer = audioContext.createBuffer(channels, length, sampleRate)

    // Copy audio data for each channel
    for (let channel = 0; channel < channels; channel++) {
      const originalData = audioBuffer.getChannelData(channel)
      const cutData = cutBuffer.getChannelData(channel)

      // Copy the selected portion
      for (let i = 0; i < length; i++) {
        cutData[i] = originalData[startSample + i]
      }
    }

    return cutBuffer

  } catch (error) {
    throw new AudioError(
      'Failed to cut audio',
      'PROCESSING_FAILED',
      error as Error
    )
  }
}

/**
 * Apply audio processing effects
 */
export function applyAudioProcessing(
  audioBuffer: AudioBuffer,
  settings: AudioProcessingSettings,
  audioContext: AudioContext
): AudioBuffer {
  const sampleRate = audioBuffer.sampleRate
  const channels = audioBuffer.numberOfChannels
  const length = audioBuffer.length

  // Create processed buffer
  const processedBuffer = audioContext.createBuffer(channels, length, sampleRate)

  for (let channel = 0; channel < channels; channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = processedBuffer.getChannelData(channel)

    // Copy input to output first
    outputData.set(inputData)

    // Apply fade in
    if (settings.fadeIn > 0) {
      const fadeSamples = Math.floor(settings.fadeIn * sampleRate)
      for (let i = 0; i < Math.min(fadeSamples, length); i++) {
        const gain = i / fadeSamples
        outputData[i] *= gain
      }
    }

    // Apply fade out
    if (settings.fadeOut > 0) {
      const fadeSamples = Math.floor(settings.fadeOut * sampleRate)
      const fadeStart = Math.max(0, length - fadeSamples)
      for (let i = fadeStart; i < length; i++) {
        const gain = (length - i) / fadeSamples
        outputData[i] *= gain
      }
    }

    // Apply normalization
    if (settings.normalize) {
      let maxSample = 0

      // Find peak
      for (let i = 0; i < length; i++) {
        maxSample = Math.max(maxSample, Math.abs(outputData[i]))
      }

      // Normalize if peak > 0
      if (maxSample > 0) {
        const gain = 0.95 / maxSample // Leave some headroom
        for (let i = 0; i < length; i++) {
          outputData[i] *= gain
        }
      }
    }
  }

  return processedBuffer
}

/**
 * Convert audio buffer to WAV blob
 */
export function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const length = audioBuffer.length
  const sampleRate = audioBuffer.sampleRate
  const channels = audioBuffer.numberOfChannels

  // Calculate buffer size
  const arrayBuffer = new ArrayBuffer(44 + length * channels * 2)
  const view = new DataView(arrayBuffer)

  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
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

  // Audio data
  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = audioBuffer.getChannelData(channel)[i]
      const intSample = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, intSample * 0x7FFF, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

/**
 * Create a download link for audio blob
 */
export function downloadAudio(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Clean up object URL
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

/**
 * Format time in MM:SS.mmm format
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`
}

/**
 * Parse time string to seconds
 */
export function parseTime(timeString: string): number {
  const parts = timeString.split(':')
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10)
    const seconds = parseFloat(parts[1])
    return minutes * 60 + seconds
  }
  return parseFloat(timeString)
}

/**
 * Calculate optimal waveform bar count based on container width
 */
export function calculateOptimalBarCount(containerWidth: number, pixelsPerSecond: number, duration: number): number {
  const pixelsPerBar = 2 // Minimum pixels per bar for visibility
  const maxBars = Math.floor(containerWidth / pixelsPerBar)
  const idealBars = Math.floor(duration * pixelsPerSecond / pixelsPerBar)

  return Math.min(maxBars, idealBars, AUDIO_CONFIG.waveformBars)
}