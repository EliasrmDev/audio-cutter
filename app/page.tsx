'use client'

import React, { useCallback } from 'react'
import { useAudioStore, useAudioState, useError } from '@/store/useAudioStore'
import {
  AudioUploader,
  AudioCutter,
} from '@/components'
import { ExportPanel } from '@/components/export'
import { WaveformProvider } from '@/contexts/WaveformContext'
import { WaveformEditor } from '@/components/WaveformEditor'
import { WaveformControls } from '@/components/WaveformControls'
import { TimelineMarkers } from '@/components/TimelineMarkers'
import type { ExportResultFile } from '@/types/export'
import { SyncManager } from '@/components/SyncManager'

export default function AudioCutterPage() {
  const audioState = useAudioState()
  const error = useError()
  const audioFile = useAudioStore(state => state.audioFile)

  const handleFileLoaded = useCallback(() => {
    // File loaded — WaveformProvider will auto-load the waveform
  }, [])

  const handleSegmentCreated = useCallback((segment: any) => {
    console.log('Segment created:', segment)
  }, [])

  const handleExportComplete = useCallback((files: ExportResultFile[]) => {
    console.log('Export completed:', files.map(f => f.name))
  }, [])

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-foreground">
            Audio Cutter
          </h1>
          <p className="text-lg text-foreground-secondary">
            Professional audio editing tool with advanced waveform visualization
          </p>
        </div>

        {/* Global error display */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-center space-x-2">
              <svg className="h-5 w-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="space-y-8">
          {/* Upload Section */}
          <section>
            <AudioUploader onFileLoaded={handleFileLoaded} />
          </section>

          {/* Audio Processing Interface — only when file is ready */}
          {audioFile && audioState === 'ready' && (
            <WaveformProvider initialZoom={60}>
              {/* Waveform editor + controls */}
              <section aria-label="Waveform editor" className="space-y-3">
                <WaveformControls />
                <WaveformEditor height={140} />
              </section>

              {/* Timeline markers + cut controls side by side on larger screens */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <AudioCutter onSegmentCreated={handleSegmentCreated} />
                </div>
                <div>
                  <TimelineMarkers />
                </div>
              </section>

              {/* Export */}
              <section>
                <ExportPanel onExportComplete={handleExportComplete} />
              </section>
            </WaveformProvider>
          )}

          {/* Loading State */}
          {audioState === 'loading' && (
            <section className="text-center py-12">
              <div className="space-y-4">
                <div className="inline-flex items-center space-x-2">
                  <svg className="animate-spin h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-foreground">Processing audio file...</span>
                </div>
                <p className="text-sm text-foreground-secondary">
                  This may take a moment for large files
                </p>
              </div>
            </section>
          )}

          {/* Empty State */}
          {audioState === 'idle' && (
            <section className="text-center py-12">
              <div className="space-y-4">
                <div className="mx-auto p-4 bg-primary/20 rounded-full w-16 h-16 flex items-center justify-center">
                  <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Welcome to Audio Cutter
                  </h3>
                  <p className="text-foreground-secondary max-w-md mx-auto">
                    Upload an audio file to get started with professional audio editing.
                    Cut, trim, and export your audio with precision.
                  </p>
                </div>
                <div className="text-sm text-foreground-muted space-y-1">
                  <p>• Support for MP3, WAV, OGG, M4A, and FLAC formats</p>
                  <p>• Visual waveform editing with precise selection tools</p>
                  <p>• High-quality audio processing and export</p>
                  <p>• No server uploads - everything happens in your browser</p>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <footer className="text-center text-sm text-foreground-muted border-t border-border pt-6">
          <SyncManager />
          <p className="mt-4">Audio Cutter • Professional audio editing in your browser</p>
          <p className="mt-1">
            Built with Next.js, Web Audio API, and modern web technologies
          </p>
        </footer>
      </div>
    </main>
  )
}