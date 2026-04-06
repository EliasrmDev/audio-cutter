'use client'

import { useEffect, useRef, useCallback } from 'react'
import type RegionsPluginType from 'wavesurfer.js/dist/plugins/regions'
import type { Region } from 'wavesurfer.js/dist/plugins/regions'
import { useAudioStore } from '@/store/useAudioStore'
import type { AudioSelection } from '@/types/audio'

export interface UseAudioSelectionOptions {
  regionsPlugin: React.RefObject<RegionsPluginType | null>
  isWaveformReady: boolean
  duration: number
  /** When non-null the selection is locked to this fixed size (in seconds) */
  fixedDuration?: number | null
}

const REGION_ID = 'main-selection'
const REGION_COLOR = 'rgba(224, 123, 57, 0.25)'
const REGION_BORDER_COLOR = 'rgba(224, 123, 57, 0.8)'

/**
 * Manages the audio selection region.
 * Keeps WaveSurfer regions and Zustand store in sync as the single source of truth.
 */
export function useAudioSelection({
  regionsPlugin,
  isWaveformReady,
  duration,
  fixedDuration = null,
}: UseAudioSelectionOptions) {
  const { selection, setSelection } = useAudioStore()

  // Keep a stable ref to duration so callbacks don't stale-close over it
  const durationRef = useRef(duration)
  useEffect(() => { durationRef.current = duration }, [duration])

  // Track whether the current region update originated from the store
  // to avoid circular sync loops
  const updatingFromStoreRef = useRef(false)
  // Track whether the current region update originated from a drag
  const activeRegionRef = useRef<Region | null>(null)

  // ── Sync store → region ───────────────────────────────────────────────
  useEffect(() => {
    const regions = regionsPlugin.current
    if (!regions || !isWaveformReady) return

    updatingFromStoreRef.current = true

    if (!selection) {
      // Remove region if selection cleared
      const existing = regions.getRegions().find(r => r.id === REGION_ID)
      existing?.remove()
      activeRegionRef.current = null
    } else {
      const resizable = fixedDuration == null
      const existing = regions.getRegions().find(r => r.id === REGION_ID)

      if (existing) {
        existing.setOptions({
          start: selection.start,
          end: selection.end,
          drag: false,
          resize: false,
        })
      } else {
        const region = regions.addRegion({
          id: REGION_ID,
          start: selection.start,
          end: selection.end,
          color: REGION_COLOR,
          drag: false,
          resize: false,
          minLength: 0.1,
        })
        activeRegionRef.current = region
      }
    }

    // Reset flag after synchronous DOM update
    requestAnimationFrame(() => {
      updatingFromStoreRef.current = false
    })
  }, [selection, isWaveformReady, regionsPlugin, fixedDuration])

  // ── Sync region → store ───────────────────────────────────────────────
  useEffect(() => {
    const regions = regionsPlugin.current
    if (!regions || !isWaveformReady) return

    const handleRegionCreated = (region: Region) => {
      if (updatingFromStoreRef.current) return
      if (region.id !== REGION_ID) {
        // User dragged to create a new selection — capture bounds, remove the
        // transient region, then commit to store. The store→region sync effect
        // will create the canonical REGION_ID region.
        const start = region.start
        const end   = region.end
        updatingFromStoreRef.current = true
        region.remove()
        updatingFromStoreRef.current = false
        const { setSelection } = useAudioStore.getState()
        const clampedStart = Math.max(0, Math.min(duration, start))
        const clampedEnd   = Math.max(clampedStart + 0.1, Math.min(duration, end))
        setSelection({ start: clampedStart, end: clampedEnd, duration: clampedEnd - clampedStart })
        return
      }
      activeRegionRef.current = region
      commitRegionToStore(region, duration)
    }

    const handleRegionUpdated = (region: Region) => {
      if (updatingFromStoreRef.current) return
      if (region.id !== REGION_ID) return
      commitRegionToStore(region, duration)
    }

    const handleRegionRemoved = (region: Region) => {
      if (updatingFromStoreRef.current) return
      if (region.id !== REGION_ID) return
      activeRegionRef.current = null
      setSelection(null)
    }

    regions.on('region-created', handleRegionCreated)
    regions.on('region-updated', handleRegionUpdated)
    regions.on('region-removed', handleRegionRemoved)

    return () => {
      regions.un('region-created', handleRegionCreated)
      regions.un('region-updated', handleRegionUpdated)
      regions.un('region-removed', handleRegionRemoved)
    }
  }, [isWaveformReady, duration, regionsPlugin, setSelection])

  // ── Public API ────────────────────────────────────────────────────────

  /** Clear the active region and store selection */
  const clearSelection = useCallback(() => {
    const regions = regionsPlugin.current
    if (regions) {
      regions.getRegions().find(r => r.id === REGION_ID)?.remove()
    }
    setSelection(null)
  }, [regionsPlugin, setSelection])

  /**
   * Programmatically set a selection (e.g. from time inputs).
   * Clamps to [0, duration] and ensures start < end.
   */
  const setSelectionRange = useCallback(
    (start: number, end: number) => {
      const clampedStart = Math.max(0, Math.min(duration, start))
      const clampedEnd = Math.max(clampedStart + 0.1, Math.min(duration, end))
      const newSelection: AudioSelection = {
        start: clampedStart,
        end: clampedEnd,
        duration: clampedEnd - clampedStart,
      }
      setSelection(newSelection)
    },
    [duration, setSelection]
  )

  /**
   * Move the fixed-duration window by `delta` seconds.
   * No-op in manual mode. Reads live state to avoid stale closures.
   */
  const shiftWindow = useCallback((delta: number) => {
    const { fixedDuration: fd, selection: sel, setSelection: setS } = useAudioStore.getState()
    const totalDur = durationRef.current
    if (!sel || !fd) return
    const newStart = Math.max(0, Math.min(totalDur - fd, sel.start + delta))
    setS({ start: newStart, end: newStart + fd, duration: fd })
  }, [])

  return { clearSelection, setSelectionRange, shiftWindow }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function commitRegionToStore(region: Region, duration: number) {
  const { setSelection, fixedDuration } = useAudioStore.getState()
  let start = Math.max(0, Math.min(duration, region.start))
  let end: number
  if (fixedDuration !== null && fixedDuration > 0) {
    // Clamp start so the fixed window always fits within the audio
    start = Math.min(start, Math.max(0, duration - fixedDuration))
    end = start + fixedDuration
  } else {
    end = Math.max(start + 0.1, Math.min(duration, region.end))
  }
  setSelection({ start, end, duration: end - start })
}
