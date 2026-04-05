/**
 * Types for the advanced export system
 */

export type ExportFormat = 'wav' | 'mp3'
export type WavBitDepth = 16 | 24
export type Mp3Bitrate = 96 | 128 | 192 | 320
export type ExportSampleRate = 44100 | 48000
export type ExportMode = 'individual' | 'concatenated'
export type ExportPhase = 'idle' | 'processing' | 'encoding' | 'tagging' | 'done' | 'error'

export interface ExportSettings {
  format: ExportFormat
  // WAV options
  sampleRate: ExportSampleRate
  bitDepth: WavBitDepth
  // MP3 options
  bitrate: Mp3Bitrate
  bitrateMode: 'cbr'
  // Common
  exportMode: ExportMode
  // Processing
  normalize: boolean
}

export interface ExportMetadata {
  title: string
  artist: string
  album: string
  year: string
  genre: string
  coverArt: string | null // base64 data URL (image/jpeg or image/png)
}

export interface ExportResultFile {
  segmentId: string
  name: string
  blob: Blob
  url: string            // object URL — caller is responsible for revoking
  format: ExportFormat
  sizeBytes: number
}

export interface ExportStatus {
  phase: ExportPhase
  currentSegmentIndex: number
  totalSegments: number
  segmentProgress: number   // 0-100 for current segment
  overallProgress: number   // 0-100 across all segments
  error: string | null
  completedFiles: ExportResultFile[]
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: 'wav',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 192,
  bitrateMode: 'cbr',
  exportMode: 'individual',
  normalize: false,
}

export const DEFAULT_EXPORT_METADATA: ExportMetadata = {
  title: '',
  artist: '',
  album: '',
  year: '',
  genre: '',
  coverArt: null,
}

export const DEFAULT_EXPORT_STATUS: ExportStatus = {
  phase: 'idle',
  currentSegmentIndex: 0,
  totalSegments: 0,
  segmentProgress: 0,
  overallProgress: 0,
  error: null,
  completedFiles: [],
}
