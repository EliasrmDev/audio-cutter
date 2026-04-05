/**
 * React hook for using the Audio Worker
 * Provides a clean interface for heavy audio processing operations
 *
 * AudioBuffer cannot be transferred or cloned via postMessage (structured clone
 * algorithm does not support it). All audio data is serialised to plain objects
 * with Float32Array channel data before being sent to the worker, and
 * deserialised back into AudioBuffer on the main thread after the worker responds.
 */

import { useRef, useCallback, useEffect } from 'react'
import { useAudioStore } from '@/store/useAudioStore'
import type { WaveformData, AudioSelection, AudioProcessingSettings } from '@/types/audio'

// ── Serialisation helpers ────────────────────────────────────────────────────

interface SerializedAudioBuffer {
  sampleRate: number
  numberOfChannels: number
  length: number
  channelData: Float32Array[]
}

/**
 * Extract raw PCM data from an AudioBuffer so it can be sent via postMessage.
 * Returns copies of the channel data so the original buffer is not affected.
 */
function serializeAudioBuffer(buffer: AudioBuffer): SerializedAudioBuffer {
  const channelData: Float32Array[] = []
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    // .slice() copies the data — required so we can transfer the copy's underlying ArrayBuffer
    channelData.push(buffer.getChannelData(i).slice())
  }
  return {
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    channelData,
  }
}

/**
 * Reconstruct an AudioBuffer from a serialised representation.
 * Requires an AudioContext (obtained from the Zustand store).
 */
async function deserializeAudioBuffer(data: SerializedAudioBuffer): Promise<AudioBuffer> {
  const store = useAudioStore.getState()
  const ctx = store.audioContext ?? await store.initAudioContext()
  const buffer = ctx.createBuffer(data.numberOfChannels, data.length, data.sampleRate)
  for (let i = 0; i < data.numberOfChannels; i++) {
    // new Float32Array(typedArray) copies and produces Float32Array<ArrayBuffer>
    buffer.copyToChannel(new Float32Array(data.channelData[i]), i)
  }
  return buffer
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface AudioWorkerHookResult {
  generateWaveform: (
    audioBuffer: AudioBuffer,
    options?: { bars?: number },
    onProgress?: (progress: number) => void
  ) => Promise<WaveformData>

  cutAudio: (
    audioBuffer: AudioBuffer,
    selection: AudioSelection,
    onProgress?: (progress: number) => void
  ) => Promise<AudioBuffer>

  processAudio: (
    audioBuffer: AudioBuffer,
    settings: AudioProcessingSettings,
    onProgress?: (progress: number) => void
  ) => Promise<AudioBuffer>

  exportAudio: (
    audioBuffer: AudioBuffer,
    format?: string,
    onProgress?: (progress: number) => void
  ) => Promise<ArrayBuffer>

  isWorkerSupported: boolean
}

export function useAudioWorker(): AudioWorkerHookResult {
  const workerRef = useRef<Worker | null>(null)
  const pendingOperations = useRef<Map<string, {
    resolve: (value: any) => void
    reject: (error: Error) => void
    onProgress?: (progress: number) => void
  }>>(new Map())

  const isWorkerSupported = typeof Worker !== 'undefined'

  const getWorker = useCallback(() => {
    if (!workerRef.current && isWorkerSupported) {
      try {
        workerRef.current = new Worker(
          new URL('../workers/audioWorker.ts', import.meta.url),
          { type: 'module' }
        )

        workerRef.current.onmessage = (event) => {
          const { id, type, data, error, progress } = event.data
          const operation = pendingOperations.current.get(id)
          if (!operation) return

          switch (type) {
            case 'progress':
              operation.onProgress?.(progress)
              break
            case 'success':
              pendingOperations.current.delete(id)
              operation.resolve(data)
              break
            case 'error':
              pendingOperations.current.delete(id)
              operation.reject(new Error(error))
              break
          }
        }

        workerRef.current.onerror = (error) => {
          console.error('Audio Worker error:', error)
          for (const op of Array.from(pendingOperations.current.values())) {
            op.reject(new Error('Worker error'))
          }
          pendingOperations.current.clear()
        }
      } catch (error) {
        console.error('Failed to create audio worker:', error)
      }
    }
    return workerRef.current
  }, [isWorkerSupported])

  /**
   * Post a message to the worker with transferable ArrayBuffers for zero-copy transfer.
   */
  const postToWorker = useCallback(<T>(
    type: string,
    data: any,
    transferables: Transferable[],
    onProgress?: (progress: number) => void
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const worker = getWorker()
      if (!worker) {
        reject(new Error('Web Worker not supported'))
        return
      }

      const id = `${type}_${Date.now()}_${Math.random()}`
      pendingOperations.current.set(id, { resolve, reject, onProgress })
      worker.postMessage({ id, type, data }, transferables)
    })
  }, [getWorker])

  // ── Public API ─────────────────────────────────────────────────────────────

  const generateWaveform = useCallback(
    (audioBuffer: AudioBuffer, options?: { bars?: number }, onProgress?: (progress: number) => void) => {
      const serializedBuffer = serializeAudioBuffer(audioBuffer)
      const transferables = serializedBuffer.channelData.map(c => c.buffer as Transferable)
      return postToWorker<WaveformData>(
        'generateWaveform',
        { serializedBuffer, options },
        transferables,
        onProgress
      )
    },
    [postToWorker]
  )

  const cutAudio = useCallback(
    (audioBuffer: AudioBuffer, selection: AudioSelection, onProgress?: (progress: number) => void) => {
      const serializedBuffer = serializeAudioBuffer(audioBuffer)
      const transferables = serializedBuffer.channelData.map(c => c.buffer as Transferable)
      return postToWorker<SerializedAudioBuffer>(
        'cutAudio',
        { serializedBuffer, selection },
        transferables,
        onProgress
      ).then(deserializeAudioBuffer)
    },
    [postToWorker]
  )

  const processAudio = useCallback(
    (audioBuffer: AudioBuffer, settings: AudioProcessingSettings, onProgress?: (progress: number) => void) => {
      const serializedBuffer = serializeAudioBuffer(audioBuffer)
      const transferables = serializedBuffer.channelData.map(c => c.buffer as Transferable)
      return postToWorker<SerializedAudioBuffer>(
        'processAudio',
        { serializedBuffer, settings },
        transferables,
        onProgress
      ).then(deserializeAudioBuffer)
    },
    [postToWorker]
  )

  const exportAudio = useCallback(
    (audioBuffer: AudioBuffer, format = 'wav', onProgress?: (progress: number) => void) => {
      const serializedBuffer = serializeAudioBuffer(audioBuffer)
      const transferables = serializedBuffer.channelData.map(c => c.buffer as Transferable)
      return postToWorker<ArrayBuffer>(
        'export',
        { serializedBuffer, format },
        transferables,
        onProgress
      )
    },
    [postToWorker]
  )

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        for (const op of Array.from(pendingOperations.current.values())) {
          op.reject(new Error('Component unmounted'))
        }
        pendingOperations.current.clear()
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [])

  return { generateWaveform, cutAudio, processAudio, exportAudio, isWorkerSupported }
}
