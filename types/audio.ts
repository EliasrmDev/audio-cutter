/**
 * Core audio types for the Audio Cutter application
 */

// Audio file information
export interface AudioFile {
  file: File
  name: string
  size: number
  duration: number
  sampleRate: number
  channels: number
  format: AudioFormat
  buffer?: AudioBuffer
  url?: string
}

// Supported audio formats
export type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'm4a' | 'flac'

// Audio processing states
export type AudioState = 'idle' | 'loading' | 'ready' | 'playing' | 'cutting' | 'exporting' | 'error'

// Audio selection/cutting range
export interface AudioSelection {
  start: number  // in seconds
  end: number    // in seconds
  duration: number // calculated duration
}

// Waveform visualization data
export interface WaveformData {
  peaks: Float32Array[]  // Array of peak data for each channel
  length: number         // Number of samples
  sampleRate: number     // Sample rate
  channels: number       // Number of channels
}

// Audio player state
export interface AudioPlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  playbackRate: number
}

// Audio cut segment
export interface AudioSegment {
  id: string
  name: string
  start: number
  end: number
  duration: number
  buffer?: AudioBuffer
  url?: string
  createdAt: Date
}

// Audio processing settings
export interface AudioProcessingSettings {
  fadeIn: number          // in seconds
  fadeOut: number         // in seconds
  normalize: boolean      // normalize volume
  quality: 'low' | 'medium' | 'high' | 'lossless'
}

// Export options
export interface ExportOptions {
  format: AudioFormat
  quality: AudioQuality
  filename: string
  includeMetadata: boolean
  settings: AudioProcessingSettings
}

// Audio quality settings
export interface AudioQuality {
  bitrate: number  // kbps for lossy, bit depth for lossless
  sampleRate: number
}

// Audio analysis data
export interface AudioAnalysis {
  rms: number[]           // Root mean square values
  peaks: number[]         // Peak values
  spectralData?: Float32Array // Optional frequency data
  silenceDetection?: SilenceRegion[]
}

// Silence detection regions
export interface SilenceRegion {
  start: number
  end: number
  duration: number
}

// Audio processing events
export type AudioEvent =
  | { type: 'load_start'; payload: { filename: string } }
  | { type: 'load_progress'; payload: { progress: number } }
  | { type: 'load_complete'; payload: { audioFile: AudioFile } }
  | { type: 'load_error'; payload: { error: string } }
  | { type: 'decode_start' }
  | { type: 'decode_complete'; payload: { buffer: AudioBuffer } }
  | { type: 'decode_error'; payload: { error: string } }
  | { type: 'cut_start'; payload: { selection: AudioSelection } }
  | { type: 'cut_complete'; payload: { segment: AudioSegment } }
  | { type: 'cut_error'; payload: { error: string } }
  | { type: 'export_start'; payload: { options: ExportOptions } }
  | { type: 'export_progress'; payload: { progress: number } }
  | { type: 'export_complete'; payload: { url: string; filename: string } }
  | { type: 'export_error'; payload: { error: string } }

// Audio validation result
export interface AudioValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  fileInfo?: {
    size: number
    type: string
    duration?: number
  }
}

// Settings for waveform visualization
export interface WaveformSettings {
  height: number
  width: number
  pixelsPerSecond: number
  barWidth: number
  barGap: number
  backgroundColor: string
  waveColor: string
  progressColor: string
  selectionColor: string
  cursorColor: string
  showTimeline: boolean
  showGrid: boolean
}

// Audio context configuration
export interface AudioContextConfig {
  sampleRate?: number
  latencyHint?: AudioContextLatencyCategory
  maxChannelCount?: number
}

// Error types
export class AudioError extends Error {
  constructor(
    message: string,
    public code: AudioErrorCode,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'AudioError'
  }
}

export type AudioErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'DECODE_FAILED'
  | 'INVALID_SELECTION'
  | 'PROCESSING_FAILED'
  | 'EXPORT_FAILED'
  | 'BROWSER_UNSUPPORTED'
  | 'UNKNOWN_ERROR'

// Utility type for async operations
export interface AsyncOperation<T> {
  loading: boolean
  data?: T
  error?: string
}

// Component props types
export interface BaseComponentProps {
  className?: string
  disabled?: boolean
  'aria-label'?: string
}

// Constants
export const SUPPORTED_FORMATS: AudioFormat[] = ['mp3', 'wav', 'ogg', 'm4a', 'flac']
export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
export const DEFAULT_SAMPLE_RATE = 44100
export const DEFAULT_BIT_RATE = 128 // kbps
export const MIN_SELECTION_DURATION = 0.1 // seconds
export const MAX_SELECTION_DURATION = 3600 // 1 hour