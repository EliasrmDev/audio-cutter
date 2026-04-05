'use client'

import React, { useCallback, useState } from 'react'
import { Upload, FileAudio, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useAudioStore } from '@/store/useAudioStore'
import { useAudioWorker } from '@/lib/useAudioWorker'
import { decodeAudioFile, validateAudioFile } from '@/lib/audioUtils'
import { Button, Progress } from '@/components/ui'
import type { BaseComponentProps } from '@/types/audio'

export interface AudioUploaderProps extends BaseComponentProps {
  onFileLoaded?: () => void
  maxFileSize?: number
  acceptedFormats?: string[]
}

export function AudioUploader({
  disabled = false,
  className,
  onFileLoaded,
  maxFileSize = 50 * 1024 * 1024, // 50MB
  acceptedFormats = ['mp3', 'wav', 'ogg', 'm4a', 'flac']
}: AudioUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const {
    audioFile,
    state,
    loadAudioFile,
    setProcessingProgress,
    initAudioContext,
    clearAudioFile
  } = useAudioStore()

  const { generateWaveform } = useAudioWorker()

  const isLoading = state === 'loading'
  const isProcessing = state === 'loading'

  const handleFileUpload = useCallback(async (file: File) => {
    setError(null)
    setUploadProgress(0)

    try {
      // Validate file
      const validation = validateAudioFile(file)
      if (!validation.isValid) {
        setError(validation.error!)
        return
      }

      // Load the file
      await loadAudioFile(file)

      // Generate waveform data
      const audioBuffer = useAudioStore.getState().audioBuffer
      if (audioBuffer) {
        await generateWaveform(
          audioBuffer,
          { bars: 1000 },
          (progress) => setProcessingProgress(progress)
        ).then(waveformData => {
          useAudioStore.getState().setWaveformData(waveformData)
        })
      }

      onFileLoaded?.()
      setUploadProgress(100)

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to load audio file'
      setError(errorMsg)
      console.error('File upload error:', error)
    }
  }, [loadAudioFile, generateWaveform, setProcessingProgress, onFileLoaded])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }, [handleFileUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragOver(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    if (disabled) return

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileUpload(file)
    }
  }, [disabled, handleFileUpload])

  const handleClearFile = useCallback(() => {
    clearAudioFile()
    setError(null)
    setUploadProgress(0)
  }, [clearAudioFile])

  // If file is loaded, show file info
  if (audioFile && state === 'ready') {
    return (
      <div className={clsx('space-y-4', className)}>
        <div className="flex items-center justify-between p-4 bg-background-secondary rounded-lg border border-primary/20">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <FileAudio className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">{audioFile.name}</p>
              <p className="text-sm text-foreground-secondary">
                {(audioFile.size / 1024 / 1024).toFixed(1)} MB •
                {Math.round(audioFile.duration)}s •
                {audioFile.sampleRate / 1000}kHz •
                {audioFile.channels} channel{audioFile.channels > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFile}
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx('space-y-4', className)}>
      <div
        className={clsx(
          'upload-area',
          {
            'dragover border-primary bg-primary/5': isDragOver && !disabled,
            'opacity-50 cursor-not-allowed': disabled
          }
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="audio-file-input"
          accept={acceptedFormats.map(f => `.${f}`).join(',')}
          onChange={handleFileSelect}
          disabled={disabled || isLoading}
          className="sr-only"
          aria-describedby="file-upload-description"
        />

        <label
          htmlFor="audio-file-input"
          className="cursor-pointer block"
        >
          <div className="space-y-4 text-center">
            <div className={clsx(
              'mx-auto p-4 rounded-full w-16 h-16 flex items-center justify-center',
              isDragOver ? 'bg-primary text-white' : 'bg-primary/20 text-primary'
            )}>
              <Upload className="h-8 w-8" />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {isDragOver ? 'Drop your audio file' : 'Upload Audio File'}
              </h3>
              <p className="text-foreground-secondary" id="file-upload-description">
                {isDragOver
                  ? 'Release to upload'
                  : 'Drag and drop your audio file here or click to browse'
                }
              </p>
              <p className="text-sm text-foreground-muted mt-2">
                Supports {acceptedFormats.map(f => f.toUpperCase()).join(', ')} •
                Max size: {Math.round(maxFileSize / 1024 / 1024)}MB
              </p>
            </div>
          </div>
        </label>
      </div>

      {/* Loading progress */}
      {isLoading && (
        <div className="space-y-2">
          <Progress
            value={uploadProgress}
            showValue
            aria-label="Upload progress"
          />
          <p className="text-sm text-foreground-secondary text-center">
            {uploadProgress < 50 ? 'Reading file...' :
             uploadProgress < 90 ? 'Decoding audio...' :
             'Generating waveform...'}
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-center space-x-2">
            <X className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        </div>
      )}
    </div>
  )
}