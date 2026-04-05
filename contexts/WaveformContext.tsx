'use client'

import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react'
import type WaveSurferType from 'wavesurfer.js'
import type RegionsPluginType from 'wavesurfer.js/dist/plugins/regions'
import { useAudioStore } from '@/store/useAudioStore'

export interface WaveformContextValue {
  /** Ref to the WaveSurfer container div — attach to a <div> in WaveformEditor */
  waveContainerRef: React.RefObject<HTMLDivElement>
  /** Ref to the timeline container div — attach to a <div> in WaveformEditor */
  timelineContainerRef: React.RefObject<HTMLDivElement>
  /** Ref to the current WaveSurfer instance */
  wavesurfer: React.RefObject<WaveSurferType | null>
  /** Ref to the Regions plugin */
  regionsPlugin: React.RefObject<RegionsPluginType | null>
  isReady: boolean
  zoom: number
  setZoom: (pxPerSec: number) => void
  play: () => void
  pause: () => void
  togglePlayPause: () => void
  seekTo: (time: number) => void
}

const WaveformContext = createContext<WaveformContextValue | null>(null)

export function useWaveformContext(): WaveformContextValue {
  const ctx = useContext(WaveformContext)
  if (!ctx) throw new Error('useWaveformContext must be used inside <WaveformProvider>')
  return ctx
}

interface WaveformProviderProps {
  children: React.ReactNode
  initialZoom?: number
}

const MIN_ZOOM = 10
const MAX_ZOOM = 500

export function WaveformProvider({ children, initialZoom = 60 }: WaveformProviderProps) {
  const waveContainerRef = useRef<HTMLDivElement>(null)
  const timelineContainerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurferType | null>(null)
  const regionsRef = useRef<RegionsPluginType | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [zoom, setZoomState] = useState(initialZoom)

  const onReadyRef = useRef<((dur: number) => void) | null>(null)

  const { audioUrl, setPlaying, setCurrentTime, updatePlayer, player } = useAudioStore()

  // ── Build WaveSurfer whenever audioUrl or container changes ────────────
  useEffect(() => {
    if (!audioUrl) return

    let cancelled = false

    const init = async () => {
      // Wait a tick so the container div is mounted
      await new Promise(r => setTimeout(r, 0))
      if (cancelled || !waveContainerRef.current) return

      const [WaveSurfer, { default: RegionsPlugin }, { default: TimelinePlugin }, { default: HoverPlugin }] =
        await Promise.all([
          import('wavesurfer.js').then(m => m.default),
          import('wavesurfer.js/dist/plugins/regions'),
          import('wavesurfer.js/dist/plugins/timeline'),
          import('wavesurfer.js/dist/plugins/hover'),
        ])

      if (cancelled || !waveContainerRef.current) return

      // Tear down previous instance
      if (wavesurferRef.current) {
        try { wavesurferRef.current.destroy() } catch { /* ignore */ }
        wavesurferRef.current = null
        regionsRef.current = null
      }

      setIsReady(false)

      const regions = RegionsPlugin.create()
      regionsRef.current = regions

      const timelinePlugins = timelineContainerRef.current
        ? [TimelinePlugin.create({
            container: timelineContainerRef.current,
            primaryLabelInterval: 2,
            secondaryLabelInterval: 0.5,
            style: { fontSize: '11px', color: '#888888' },
          })]
        : []

      const ws = WaveSurfer.create({
        container: waveContainerRef.current!,
        url: audioUrl,
        waveColor: '#3c3c3c',
        progressColor: '#e07b39',
        cursorColor: '#ffffff',
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 'auto',
        normalize: true,
        interact: true,
        minPxPerSec: zoom,
        plugins: [
          regions,
          ...timelinePlugins,
          HoverPlugin.create({
            lineColor: 'rgba(255,255,255,0.6)',
            lineWidth: 1,
            labelBackground: '#1a1a1a',
            labelColor: '#d1d1d1',
            labelSize: '11px',
          }),
        ],
      })

      wavesurferRef.current = ws

      ws.on('ready', (duration) => {
        if (cancelled) return
        setIsReady(true)
        updatePlayer({ duration, currentTime: 0 })
      })

      ws.on('audioprocess', (t) => { if (!cancelled) setCurrentTime(t) })
      ws.on('seeking', (t) => { if (!cancelled) setCurrentTime(t) })
      ws.on('play', () => { if (!cancelled) setPlaying(true) })
      ws.on('pause', () => { if (!cancelled) setPlaying(false) })
      ws.on('finish', () => {
        if (!cancelled) { setPlaying(false); setCurrentTime(0) }
      })
      ws.on('error', (err) => {
        if (!cancelled) {
          console.error('[WaveSurfer]', err)
          useAudioStore.getState().setError(
            `Waveform error: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      })
    }

    init().catch(err => {
      if (!cancelled) console.error('[WaveformProvider] init error:', err)
    })

    return () => {
      cancelled = true
      const ws = wavesurferRef.current
      if (ws) {
        setTimeout(() => { try { ws.destroy() } catch { /* ignore */ } }, 0)
        wavesurferRef.current = null
        regionsRef.current = null
      }
      setIsReady(false)
    }
  // We only want to re-run when the audio URL changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl])

  // Sync volume / mute to WaveSurfer
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws || !isReady) return
    ws.setVolume(player.muted ? 0 : player.volume)
  }, [player.volume, player.muted, isReady])

  // ── API ────────────────────────────────────────────────────────────────

  const setZoom = useCallback((value: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value)))
    setZoomState(clamped)
    wavesurferRef.current?.zoom(clamped)
  }, [])

  const play = useCallback(() => wavesurferRef.current?.play(), [])
  const pause = useCallback(() => wavesurferRef.current?.pause(), [])

  const togglePlayPause = useCallback(() => {
    const ws = wavesurferRef.current
    if (!ws) return
    ws.isPlaying() ? ws.pause() : ws.play()
  }, [])

  const seekTo = useCallback((time: number) => {
    wavesurferRef.current?.setTime(time)
  }, [])

  return (
    <WaveformContext.Provider
      value={{
        waveContainerRef,
        timelineContainerRef,
        wavesurfer: wavesurferRef,
        regionsPlugin: regionsRef,
        isReady,
        zoom,
        setZoom,
        play,
        pause,
        togglePlayPause,
        seekTo,
      }}
    >
      {children}
    </WaveformContext.Provider>
  )
}
