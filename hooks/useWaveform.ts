'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type WaveSurferType from 'wavesurfer.js'
import type RegionsPluginType from 'wavesurfer.js/dist/plugins/regions'
import { useAudioStore } from '@/store/useAudioStore'

export interface WaveformColors {
  waveColor: string
  progressColor: string
  cursorColor: string
  backgroundColor?: string
  regionColor?: string
}

export interface UseWaveformOptions {
  container: React.RefObject<HTMLDivElement>
  timelineContainer?: React.RefObject<HTMLDivElement>
  colors?: Partial<WaveformColors>
  minPxPerSec?: number
  onReady?: (duration: number) => void
  onError?: (error: Error) => void
}

export interface UseWaveformReturn {
  wavesurfer: React.RefObject<WaveSurferType | null>
  regionsPlugin: React.RefObject<RegionsPluginType | null>
  isReady: boolean
  zoom: number
  setZoom: (value: number) => void
  play: () => void
  pause: () => void
  seekTo: (time: number) => void
  seekToPercent: (percent: number) => void
}

const DEFAULT_COLORS: WaveformColors = {
  waveColor: '#444444',
  progressColor: '#e07b39',
  cursorColor: '#ffffff',
  backgroundColor: '#111111',
  regionColor: 'rgba(224, 123, 57, 0.25)',
}

const MIN_ZOOM = 10
const MAX_ZOOM = 500

export function useWaveform({
  container,
  timelineContainer,
  colors = {},
  minPxPerSec = 50,
  onReady,
  onError,
}: UseWaveformOptions): UseWaveformReturn {
  const wavesurferRef = useRef<WaveSurferType | null>(null)
  const regionsRef = useRef<RegionsPluginType | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [zoom, setZoomState] = useState(minPxPerSec)

  // Stable refs to avoid stale closures in event handlers
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  useEffect(() => { onReadyRef.current = onReady }, [onReady])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  const resolvedColors = { ...DEFAULT_COLORS, ...colors }

  const {
    setPlaying,
    setCurrentTime,
    updatePlayer,
    audioUrl,
    player,
  } = useAudioStore()

  // Initialize WaveSurfer (runs once per mount with a valid container + audioUrl)
  useEffect(() => {
    if (!container.current || !audioUrl) return

    let cancelled = false

    const init = async () => {
      // Dynamic imports to avoid SSR issues
      const [WaveSurfer, { default: RegionsPlugin }, { default: TimelinePlugin }, { default: HoverPlugin }] =
        await Promise.all([
          import('wavesurfer.js').then(m => m.default),
          import('wavesurfer.js/dist/plugins/regions'),
          import('wavesurfer.js/dist/plugins/timeline'),
          import('wavesurfer.js/dist/plugins/hover'),
        ])

      if (cancelled || !container.current) return

      // Destroy previous instance safely
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy()
        wavesurferRef.current = null
        regionsRef.current = null
      }

      const regions = RegionsPlugin.create()
      regionsRef.current = regions

      const timelinePlugins = timelineContainer?.current
        ? [TimelinePlugin.create({
            container: timelineContainer.current,
            primaryLabelInterval: 2,
            secondaryLabelInterval: 0.5,
            style: {
              fontSize: '11px',
              color: '#888888',
            },
          })]
        : []

      const ws = WaveSurfer.create({
        container: container.current!,
        url: audioUrl,
        waveColor: resolvedColors.waveColor,
        progressColor: resolvedColors.progressColor,
        cursorColor: resolvedColors.cursorColor,
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 'auto',
        normalize: true,
        interact: true,
        minPxPerSec,
        plugins: [
          regions,
          ...timelinePlugins,
          HoverPlugin.create({
            lineColor: '#ffffff',
            lineWidth: 1,
            labelBackground: '#1a1a1a',
            labelColor: '#ffffff',
            labelSize: '11px',
          }),
        ],
      })

      wavesurferRef.current = ws

      // ── Event listeners ──────────────────────────────────────────────

      ws.on('ready', (duration) => {
        if (cancelled) return
        setIsReady(true)
        updatePlayer({ duration, currentTime: 0 })
        onReadyRef.current?.(duration)
      })

      ws.on('audioprocess', (currentTime) => {
        if (cancelled) return
        setCurrentTime(currentTime)
      })

      ws.on('seeking', (currentTime) => {
        if (cancelled) return
        setCurrentTime(currentTime)
      })

      ws.on('play', () => {
        if (cancelled) return
        setPlaying(true)
      })

      ws.on('pause', () => {
        if (cancelled) return
        setPlaying(false)
      })

      ws.on('finish', () => {
        if (cancelled) return
        setPlaying(false)
        setCurrentTime(0)
      })

      ws.on('error', (err) => {
        if (cancelled) return
        console.error('[WaveSurfer] Error:', err)
        onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)))
      })
    }

    init().catch((err) => {
      if (!cancelled) {
        console.error('[useWaveform] Init failed:', err)
        onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)))
      }
    })

    return () => {
      cancelled = true
      // Defer destroy so React strict-mode double-invoke doesn't break ongoing init
      const ws = wavesurferRef.current
      if (ws) {
        // Use setTimeout to avoid destroying during active audio decode
        setTimeout(() => {
          try { ws.destroy() } catch { /* ignore */ }
        }, 0)
        wavesurferRef.current = null
        regionsRef.current = null
      }
      setIsReady(false)
    }
  // Re-run when the audio URL changes (new file loaded)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, container])

  // Sync volume/mute changes from store → WaveSurfer
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws || !isReady) return
    ws.setVolume(player.muted ? 0 : player.volume)
  }, [player.volume, player.muted, isReady])

  // ── Zoom ───────────────────────────────────────────────────────────────

  const setZoom = useCallback((value: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value))
    setZoomState(clamped)
    wavesurferRef.current?.zoom(clamped)
  }, [])

  // ── Playback controls ─────────────────────────────────────────────────

  const play = useCallback(() => {
    wavesurferRef.current?.play()
  }, [])

  const pause = useCallback(() => {
    wavesurferRef.current?.pause()
  }, [])

  const seekTo = useCallback((time: number) => {
    const ws = wavesurferRef.current
    if (!ws) return
    ws.setTime(time)
  }, [])

  const seekToPercent = useCallback((percent: number) => {
    const ws = wavesurferRef.current
    if (!ws || !isReady) return
    const duration = ws.getDuration()
    ws.setTime(Math.max(0, Math.min(duration, percent * duration)))
  }, [isReady])

  return {
    wavesurfer: wavesurferRef,
    regionsPlugin: regionsRef,
    isReady,
    zoom,
    setZoom,
    play,
    pause,
    seekTo,
    seekToPercent,
  }
}
