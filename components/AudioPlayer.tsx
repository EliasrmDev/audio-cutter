'use client'

import React, { useRef, useEffect, useCallback } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { clsx } from 'clsx'
import { useAudioStore, usePlayer, useAudioFile } from '@/store/useAudioStore'
import { Button, Slider } from '@/components/ui'
import { formatTime } from '@/lib/audioUtils'
import type { BaseComponentProps } from '@/types/audio'

export interface AudioPlayerProps extends BaseComponentProps {
  onTimeUpdate?: (currentTime: number) => void
  showWaveform?: boolean
}

export function AudioPlayer({
  disabled = false,
  className,
  onTimeUpdate,
  'aria-label': ariaLabel = 'Audio player controls'
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const rafRef = useRef<number>()

  const audioFile = useAudioFile()
  const player = usePlayer()
  const {
    setPlaying,
    setCurrentTime,
    setVolume,
    setMuted,
    updatePlayer
  } = useAudioStore()

  const isReady = audioFile && audioFile.url

  // Sync audio element with store
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !isReady) return

    audio.src = audioFile.url!
    audio.volume = player.volume
    audio.muted = player.muted
    audio.playbackRate = player.playbackRate

  }, [audioFile, isReady, player.volume, player.muted, player.playbackRate])

  // Handle play/pause
  const handlePlayPause = useCallback(async () => {
    const audio = audioRef.current
    if (!audio || disabled) return

    try {
      if (player.isPlaying) {
        audio.pause()
        setPlaying(false)
      } else {
        await audio.play()
        setPlaying(true)
      }
    } catch (error) {
      console.error('Playback error:', error)
      setPlaying(false)
    }
  }, [player.isPlaying, disabled, setPlaying])

  // Handle seeking
  const handleSeek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio || disabled) return

    audio.currentTime = time
    setCurrentTime(time)
  }, [disabled, setCurrentTime])

  // Handle volume change
  const handleVolumeChange = useCallback((volume: number) => {
    const audio = audioRef.current
    if (!audio) return

    audio.volume = volume
    setVolume(volume)

    if (volume > 0 && player.muted) {
      audio.muted = false
      setMuted(false)
    }
  }, [setVolume, setMuted, player.muted])

  // Handle mute toggle
  const handleMuteToggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    const newMuted = !player.muted
    audio.muted = newMuted
    setMuted(newMuted)
  }, [player.muted, setMuted])

  // Time update animation loop
  const updateTime = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    const currentTime = audio.currentTime
    setCurrentTime(currentTime)
    onTimeUpdate?.(currentTime)

    if (player.isPlaying) {
      rafRef.current = requestAnimationFrame(updateTime)
    }
  }, [setCurrentTime, onTimeUpdate, player.isPlaying])

  // Start/stop time updates
  useEffect(() => {
    if (player.isPlaying) {
      rafRef.current = requestAnimationFrame(updateTime)
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [player.isPlaying, updateTime])

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      updatePlayer({
        duration: audio.duration,
        currentTime: audio.currentTime
      })
    }

    const handleEnded = () => {
      setPlaying(false)
      setCurrentTime(0)
    }

    const handleError = (e: Event) => {
      console.error('Audio error:', e)
      setPlaying(false)
    }

    const handleCanPlay = () => {
      // Audio is ready to play
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('canplay', handleCanPlay)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('canplay', handleCanPlay)
    }
  }, [updatePlayer, setPlaying, setCurrentTime])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target !== document.body && !(e.target as HTMLElement).closest('[data-audio-player]')) {
        return
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          handlePlayPause()
          break
        case 'ArrowLeft':
          e.preventDefault()
          handleSeek(Math.max(0, player.currentTime - 5))
          break
        case 'ArrowRight':
          e.preventDefault()
          handleSeek(Math.min(player.duration, player.currentTime + 5))
          break
        case 'KeyM':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            handleMuteToggle()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyPress)
    return () => document.removeEventListener('keydown', handleKeyPress)
  }, [handlePlayPause, handleSeek, handleMuteToggle, player.currentTime, player.duration])

  if (!isReady) {
    return (
      <div className={clsx('audio-controls opacity-50', className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button disabled size="md" aria-label="Play/pause (no audio loaded)">
              <Play className="h-5 w-5" />
            </Button>
            <div className="text-sm text-foreground-muted">
              <span className="font-mono">00:00.000</span>
              <span className="mx-2">/</span>
              <span className="font-mono">00:00.000</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <VolumeX className="h-4 w-4 text-foreground-muted" />
            <div className="w-24 h-2 bg-border rounded-full" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx('space-y-4', className)} data-audio-player>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        preload="metadata"
        className="sr-only"
      />

      {/* Player controls */}
      <div className="audio-controls">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Play/Pause button */}
            <Button
              onClick={handlePlayPause}
              disabled={disabled}
              size="md"
              aria-label={player.isPlaying ? 'Pause audio' : 'Play audio'}
            >
              {player.isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </Button>

            {/* Time display */}
            <div className="text-sm text-foreground-secondary">
              <span className="font-mono">{formatTime(player.currentTime)}</span>
              <span className="mx-2 text-foreground-muted">/</span>
              <span className="font-mono">{formatTime(player.duration)}</span>
            </div>
          </div>

          {/* Volume controls */}
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMuteToggle}
              disabled={disabled}
              aria-label={player.muted ? 'Unmute' : 'Mute'}
            >
              {player.muted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>

            <Slider
              value={player.muted ? 0 : player.volume}
              min={0}
              max={1}
              step={0.1}
              onChange={handleVolumeChange}
              disabled={disabled}
              className="w-24"
              aria-label="Volume"
              formatValue={(value) => `${Math.round(value * 100)}%`}
            />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Slider
          value={player.currentTime}
          min={0}
          max={player.duration || 1}
          step={0.1}
          onChange={handleSeek}
          disabled={disabled || !isReady}
          className="w-full"
          aria-label="Audio progress"
          formatValue={formatTime}
          showValue
        />
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="text-xs text-foreground-muted space-y-1">
        <p><kbd className="px-1 py-0.5 bg-background-secondary rounded">Space</kbd> Play/Pause</p>
        <p><kbd className="px-1 py-0.5 bg-background-secondary rounded">←/→</kbd> Seek ±5s</p>
        <p><kbd className="px-1 py-0.5 bg-background-secondary rounded">Cmd/Ctrl+M</kbd> Mute/Unmute</p>
      </div>
    </div>
  )
}