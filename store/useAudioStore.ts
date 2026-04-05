import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  AudioFile,
  AudioState,
  AudioSelection,
  AudioPlayerState,
  AudioSegment,
  WaveformData,
  AudioEvent,
  ExportOptions
} from '@/types/audio'
import type { ExportSettings, ExportMetadata, ExportStatus } from '@/types/export'
import {
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_EXPORT_METADATA,
  DEFAULT_EXPORT_STATUS
} from '@/types/export'

/**
 * Main audio store using Zustand for state management
 * Replaces all global variables from the original implementation
 */

interface AudioStore {
  // Core state
  state: AudioState
  error: string | null

  // Audio file data
  audioFile: AudioFile | null
  waveformData: WaveformData | null

  // Player state
  player: AudioPlayerState

  // Selection and cutting
  selection: AudioSelection | null
  segments: AudioSegment[]
  activeSegment: AudioSegment | null

  // UI state
  isWaveformReady: boolean
  isProcessing: boolean
  processingProgress: number

  // Audio context and buffer
  audioContext: AudioContext | null
  audioBuffer: AudioBuffer | null
  audioUrl: string | null

  // Actions
  setAudioFile: (file: AudioFile) => void
  setAudioBuffer: (buffer: AudioBuffer) => void
  setWaveformData: (data: WaveformData) => void
  setState: (state: AudioState) => void
  setError: (error: string | null) => void

  // Player actions
  updatePlayer: (updates: Partial<AudioPlayerState>) => void
  setPlaying: (playing: boolean) => void
  setCurrentTime: (time: number) => void
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void

  // Selection actions
  setSelection: (selection: AudioSelection | null) => void
  updateSelection: (updates: Partial<AudioSelection>) => void

  // Segment actions
  addSegment: (segment: AudioSegment) => void
  removeSegment: (id: string) => void
  setActiveSegment: (segment: AudioSegment | null) => void
  clearSegments: () => void

  // Processing actions
  setProcessing: (processing: boolean) => void
  setProcessingProgress: (progress: number) => void

  // Audio context actions
  initAudioContext: () => Promise<AudioContext>
  closeAudioContext: () => void

  // File actions
  loadAudioFile: (file: File) => Promise<void>
  clearAudioFile: () => void

  // Export settings / metadata / status
  exportSettings: ExportSettings
  exportMetadata: ExportMetadata
  exportStatus: ExportStatus
  setExportSettings: (updates: Partial<ExportSettings>) => void
  setExportMetadata: (updates: Partial<ExportMetadata>) => void
  setExportStatus: (updates: Partial<ExportStatus>) => void
  resetExportStatus: () => void

  // Export actions
  exportSegment: (segment: AudioSegment, options: ExportOptions) => Promise<string>

  // Event handling
  dispatchEvent: (event: AudioEvent) => void

  // Cleanup
  cleanup: () => void
}

export const useAudioStore = create<AudioStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      state: 'idle',
      error: null,

      audioFile: null,
      waveformData: null,

      player: {
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 1,
        muted: false,
        playbackRate: 1
      },

      selection: null,
      segments: [],
      activeSegment: null,

      isWaveformReady: false,
      isProcessing: false,
      processingProgress: 0,

      audioContext: null,
      audioBuffer: null,
      audioUrl: null,

      exportSettings: DEFAULT_EXPORT_SETTINGS,
      exportMetadata: DEFAULT_EXPORT_METADATA,
      exportStatus: DEFAULT_EXPORT_STATUS,

      // Core actions
      setAudioFile: (file) => set({ audioFile: file }),

      setAudioBuffer: (buffer) => set({
        audioBuffer: buffer,
        player: {
          ...get().player,
          duration: buffer.duration
        }
      }),

      setWaveformData: (data) => set({
        waveformData: data,
        isWaveformReady: true
      }),

      setState: (state) => set({ state }),

      setError: (error) => set({ error }),

      // Player actions
      updatePlayer: (updates) => set(state => ({
        player: { ...state.player, ...updates }
      })),

      setPlaying: (playing) => set(state => ({
        player: { ...state.player, isPlaying: playing }
      })),

      setCurrentTime: (time) => set(state => ({
        player: { ...state.player, currentTime: time }
      })),

      setVolume: (volume) => set(state => ({
        player: { ...state.player, volume }
      })),

      setMuted: (muted) => set(state => ({
        player: { ...state.player, muted }
      })),

      // Selection actions
      setSelection: (selection) => set({ selection }),

      updateSelection: (updates) => set(state => {
        if (!state.selection) return state
        return {
          selection: { ...state.selection, ...updates }
        }
      }),

      // Segment actions
      addSegment: (segment) => set(state => ({
        segments: [...state.segments, segment]
      })),

      removeSegment: (id) => set(state => ({
        segments: state.segments.filter(s => s.id !== id),
        activeSegment: state.activeSegment?.id === id ? null : state.activeSegment
      })),

      setActiveSegment: (segment) => set({ activeSegment: segment }),

      clearSegments: () => set({ segments: [], activeSegment: null }),

      // Processing actions
      setProcessing: (processing) => set({ isProcessing: processing }),

      setProcessingProgress: (progress) => set({
        processingProgress: Math.max(0, Math.min(100, progress))
      }),

      // Audio context actions
      initAudioContext: async () => {
        const state = get()
        if (state.audioContext && state.audioContext.state === 'running') {
          return state.audioContext
        }

        try {
          const context = new AudioContext()

          // Resume context if suspended (browser autoplay policy)
          if (context.state === 'suspended') {
            await context.resume()
          }

          set({ audioContext: context })
          return context
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Failed to create audio context'
          set({
            error: errorMsg,
            state: 'error'
          })
          throw error
        }
      },

      closeAudioContext: () => {
        const { audioContext } = get()
        if (audioContext) {
          audioContext.close()
          set({ audioContext: null })
        }
      },

      // File actions
      loadAudioFile: async (file) => {
        set({
          state: 'loading',
          error: null,
          isProcessing: true,
          processingProgress: 0
        })

        try {
          // Create file info
          const audioFile: AudioFile = {
            file,
            name: file.name,
            size: file.size,
            duration: 0, // Will be updated after decoding
            sampleRate: 0,
            channels: 0,
            format: file.name.split('.').pop()?.toLowerCase() as any || 'mp3',
            url: URL.createObjectURL(file)
          }

          set({
            audioFile,
            audioUrl: audioFile.url,
            processingProgress: 25
          })

          // Initialize audio context
          const context = await get().initAudioContext()

          set({ processingProgress: 50 })

          // Load and decode audio data
          const arrayBuffer = await file.arrayBuffer()
          set({ processingProgress: 75 })

          const audioBuffer = await context.decodeAudioData(arrayBuffer)

          // Update file info with decoded data
          const updatedFile: AudioFile = {
            ...audioFile,
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
            channels: audioBuffer.numberOfChannels,
            buffer: audioBuffer
          }

          set({
            audioFile: updatedFile,
            audioBuffer,
            state: 'ready',
            isProcessing: false,
            processingProgress: 100
          })

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Failed to load audio file'
          set({
            error: errorMsg,
            state: 'error',
            isProcessing: false,
            processingProgress: 0
          })
          throw error
        }
      },

      clearAudioFile: () => {
        const { audioUrl } = get()
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl)
        }

        set({
          audioFile: null,
          audioBuffer: null,
          audioUrl: null,
          waveformData: null,
          selection: null,
          activeSegment: null,
          isWaveformReady: false,
          state: 'idle',
          player: {
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            volume: 1,
            muted: false,
            playbackRate: 1
          }
        })
      },

      // Export settings actions
      setExportSettings: (updates) => set(state => ({
        exportSettings: { ...state.exportSettings, ...updates }
      })),

      setExportMetadata: (updates) => set(state => ({
        exportMetadata: { ...state.exportMetadata, ...updates }
      })),

      setExportStatus: (updates) => set(state => ({
        exportStatus: { ...state.exportStatus, ...updates }
      })),

      resetExportStatus: () => set({ exportStatus: DEFAULT_EXPORT_STATUS }),

      // Export action placeholder
      exportSegment: async (_segment, _options) => {
        throw new Error('Use ExportPanel for exporting')
      },

      // Event handling
      dispatchEvent: (event) => {
        // Handle events for logging, analytics, etc.
        console.log('Audio Event:', event)
      },

      // Cleanup
      cleanup: () => {
        const { audioUrl, audioContext } = get()

        if (audioUrl) {
          URL.revokeObjectURL(audioUrl)
        }

        if (audioContext) {
          audioContext.close()
        }

        set({
          audioFile: null,
          audioBuffer: null,
          audioUrl: null,
          audioContext: null,
          waveformData: null,
          selection: null,
          segments: [],
          activeSegment: null,
          isWaveformReady: false,
          isProcessing: false,
          processingProgress: 0,
          state: 'idle',
          error: null,
          player: {
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            volume: 1,
            muted: false,
            playbackRate: 1
          }
        })
      }
    }),
    {
      name: 'audio-store',
      // Only serialize basic data, not complex objects like AudioBuffer
      partialize: (state: AudioStore) => ({
        player: state.player,
        selection: state.selection,
        segments: state.segments.map((s: AudioSegment) => ({
          id: s.id,
          name: s.name,
          start: s.start,
          end: s.end,
          duration: s.duration,
          createdAt: s.createdAt
        }))
      })
    }
  )
)

// Selector hooks for better performance
export const useAudioState = () => useAudioStore(state => state.state)
export const useAudioFile = () => useAudioStore(state => state.audioFile)
export const useAudioBuffer = () => useAudioStore(state => state.audioBuffer)
export const usePlayer = () => useAudioStore(state => state.player)
export const useSelection = () => useAudioStore(state => state.selection)
export const useSegments = () => useAudioStore(state => state.segments)
export const useWaveformData = () => useAudioStore(state => state.waveformData)
export const useIsProcessing = () => useAudioStore(state => state.isProcessing)
export const useExportSettings = () => useAudioStore(state => state.exportSettings)
export const useExportMetadata = () => useAudioStore(state => state.exportMetadata)
export const useExportStatus = () => useAudioStore(state => state.exportStatus)
export const useError = () => useAudioStore(state => state.error)