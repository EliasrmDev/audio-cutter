import { z } from 'zod'
import { SUPPORTED_FORMATS, MAX_FILE_SIZE, MIN_SELECTION_DURATION, MAX_SELECTION_DURATION } from '@/types/audio'

/**
 * Zod validation schemas for audio processing
 */

// Audio file validation schema
export const AudioFileSchema = z.object({
  file: z.instanceof(File),
  name: z.string().min(1, 'Filename is required'),
  size: z.number().min(1).max(MAX_FILE_SIZE, `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`),
  duration: z.number().min(0.1, 'Duration must be at least 0.1 seconds').max(MAX_SELECTION_DURATION),
  sampleRate: z.number().min(8000).max(192000),
  channels: z.number().min(1).max(8),
  format: z.enum(SUPPORTED_FORMATS as [string, ...string[]])
})

// Audio selection validation schema
export const AudioSelectionSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  duration: z.number().min(MIN_SELECTION_DURATION).max(MAX_SELECTION_DURATION)
}).refine(
  (data) => data.start < data.end,
  {
    message: 'Start time must be less than end time',
    path: ['start']
  }
).refine(
  (data) => Math.abs(data.duration - (data.end - data.start)) < 0.001,
  {
    message: 'Duration must equal end - start',
    path: ['duration']
  }
)

// Audio segment validation schema
export const AudioSegmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Segment name is required').max(100, 'Segment name too long'),
  start: z.number().min(0),
  end: z.number().min(0),
  duration: z.number().min(MIN_SELECTION_DURATION).max(MAX_SELECTION_DURATION),
  createdAt: z.date()
})

// Export options validation schema
export const ExportOptionsSchema = z.object({
  format: z.enum(SUPPORTED_FORMATS as [string, ...string[]]),
  quality: z.object({
    bitrate: z.number().min(64).max(320),
    sampleRate: z.number().min(8000).max(192000)
  }),
  filename: z.string()
    .min(1, 'Filename is required')
    .max(255, 'Filename too long')
    .regex(/^[^<>:"/\\|?*]+$/, 'Filename contains invalid characters'),
  includeMetadata: z.boolean(),
  settings: z.object({
    fadeIn: z.number().min(0).max(10),
    fadeOut: z.number().min(0).max(10),
    normalize: z.boolean(),
    quality: z.enum(['low', 'medium', 'high', 'lossless'])
  })
})

// Waveform settings validation schema
export const WaveformSettingsSchema = z.object({
  height: z.number().min(50).max(1000),
  width: z.number().min(100).max(10000),
  pixelsPerSecond: z.number().min(10).max(1000),
  barWidth: z.number().min(1).max(10),
  barGap: z.number().min(0).max(5),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  waveColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  progressColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  selectionColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  cursorColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  showTimeline: z.boolean(),
  showGrid: z.boolean()
})

// File upload validation
export const FileUploadSchema = z.object({
  files: z.array(z.instanceof(File))
    .min(1, 'At least one file is required')
    .max(1, 'Only one file allowed at a time')
    .refine(
      (files) => files.every(file => file.size <= MAX_FILE_SIZE),
      {
        message: `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`
      }
    )
    .refine(
      (files) => files.every(file => {
        const extension = file.name.split('.').pop()?.toLowerCase()
        return extension && SUPPORTED_FORMATS.includes(extension as any)
      }),
      {
        message: `Only ${SUPPORTED_FORMATS.join(', ')} files are supported`
      }
    )
})

// Time input validation
export const TimeInputSchema = z.object({
  value: z.number().min(0).max(MAX_SELECTION_DURATION),
  step: z.number().min(0.01).max(1).optional().default(0.1)
})

// Volume control validation
export const VolumeControlSchema = z.object({
  volume: z.number().min(0).max(1),
  muted: z.boolean()
})

// Playback rate validation
export const PlaybackRateSchema = z.object({
  rate: z.number().min(0.25).max(4.0)
})

/**
 * Validation functions for common use cases
 */

// Validate uploaded file
export function validateUploadedFile(file: File) {
  return FileUploadSchema.safeParse({ files: [file] })
}

// Validate audio selection
export function validateAudioSelection(selection: { start: number; end: number }) {
  const duration = selection.end - selection.start
  return AudioSelectionSchema.safeParse({
    ...selection,
    duration
  })
}

// Validate time input
export function validateTimeInput(time: number, maxDuration?: number) {
  const schema = maxDuration
    ? TimeInputSchema.extend({ value: z.number().min(0).max(maxDuration) })
    : TimeInputSchema

  return schema.safeParse({ value: time })
}

// Validate filename for export
export function validateFilename(filename: string) {
  const schema = z.string()
    .min(1, 'Filename is required')
    .max(255, 'Filename too long')
    .regex(/^[^<>:"/\\|?*]+$/, 'Filename contains invalid characters')
    .refine(
      (name) => {
        // Check if filename has an extension
        const hasExtension = name.includes('.')
        if (!hasExtension) return true // Will add extension automatically

        // If has extension, check if it's supported
        const extension = name.split('.').pop()?.toLowerCase()
        return extension && SUPPORTED_FORMATS.includes(extension as any)
      },
      {
        message: `Filename extension must be one of: ${SUPPORTED_FORMATS.join(', ')}`
      }
    )

  return schema.safeParse(filename)
}

// Custom error formatter for Zod errors
export function formatValidationError(error: z.ZodError): string {
  return error.errors
    .map(err => err.message)
    .join(', ')
}

// Type exports for use in components
export type ValidatedAudioFile = z.infer<typeof AudioFileSchema>
export type ValidatedAudioSelection = z.infer<typeof AudioSelectionSchema>
export type ValidatedExportOptions = z.infer<typeof ExportOptionsSchema>
export type ValidatedWaveformSettings = z.infer<typeof WaveformSettingsSchema>