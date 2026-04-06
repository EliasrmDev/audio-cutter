'use client'

/**
 * useSelectionLogic — core drag engine, shared by desktop and mobile.
 *
 * Responsibilities:
 *  • Converts pointer coordinates to audio times
 *  • Hit-tests the current selection to decide drag type
 *  • Manages drag state (start / move / end)
 *  • Writes selection updates to the Zustand store (rAF-throttled)
 *  • Exposes a cursor helper for whoever needs it
 *
 * Does NOT attach any DOM events — that job belongs to the platform-specific
 * hooks (useDesktopSelection / useMobileSelection).
 */

import { useCallback, useEffect, useRef } from 'react'
import { useAudioStore } from '@/store/useAudioStore'
import {
  DRAG_THRESHOLD_PX,
  SELECTION_MIN_DURATION,
  clientXToTime,
  hitTest,
  computeNewSelection,
  getCursorForState,
} from './selectionUtils'
import type { DragType, DragState } from './types'

export interface UseSelectionLogicOptions {
  /** Scrollable waveform container — provides coordinate context */
  containerRef: React.RefObject<HTMLDivElement>
  /** Total audio duration in seconds */
  duration: number
  /** Whether WaveSurfer has finished loading */
  isReady: boolean
  /** Seek the playhead (called on bare click without drag) */
  seekTo: (t: number) => void
  /** Pixel radius around each handle edge that triggers resize */
  handleHitPx: number
}

export interface UseSelectionLogicReturn {
  /** Mutable ref holding the active drag type — read only inside event/rAF handlers */
  dragTypeRef: React.MutableRefObject<DragType | null>
  /** Begin a new drag interaction at the given screen X */
  startDrag: (clientX: number, pointerId: number) => void
  /** Update the drag with a new pointer position (call on every move event) */
  moveDrag:  (clientX: number, pointerId: number) => void
  /** Commit or discard the drag on pointer release */
  endDrag:   (clientX: number, pointerId: number) => void
  /** Returns CSS cursor for a given screen X (safe to call during render) */
  getCursor: (clientX: number) => string
}

export function useSelectionLogic({
  containerRef,
  duration,
  isReady,
  seekTo,
  handleHitPx,
}: UseSelectionLogicOptions): UseSelectionLogicReturn {
  const dragRef     = useRef<DragState | null>(null)
  const rafRef      = useRef<number | null>(null)
  const dragTypeRef = useRef<DragType | null>(null)

  // Always-fresh refs so rAF callbacks never close over stale values
  const durationRef = useRef(duration)
  useEffect(() => { durationRef.current = duration }, [duration])

  const seekToRef = useRef(seekTo)
  useEffect(() => { seekToRef.current = seekTo }, [seekTo])

  // ── Hit test helper ───────────────────────────────────────────────────────

  const getHitType = useCallback((clientX: number): DragType | null => {
    const c     = containerRef.current
    const state = useAudioStore.getState()
    const d     = durationRef.current
    if (!c || d <= 0) return null
    return hitTest(
      clientX, c,
      state.selection,
      d,
      state.fixedDuration !== null,
      handleHitPx,
    )
  }, [containerRef, handleHitPx])

  // ── Cursor ────────────────────────────────────────────────────────────────

  const getCursor = useCallback((clientX: number): string => {
    return getCursorForState(dragTypeRef.current, getHitType(clientX))
  }, [getHitType])

  // ── Drag start ────────────────────────────────────────────────────────────

  const startDrag = useCallback((clientX: number, pointerId: number) => {
    if (!isReady) return
    const c = containerRef.current
    if (!c) return

    const state = useAudioStore.getState()
    const type: DragType = getHitType(clientX) ?? 'create'
    const time = clientXToTime(clientX, c, durationRef.current)
    const sel  = state.selection

    dragRef.current = {
      type,
      pointerId,
      startClientX:        clientX,
      latestClientX:       clientX,
      startTime:           time,
      selStartAtDragBegin: sel?.start ?? time,
      selEndAtDragBegin:   sel?.end   ?? time,
      hasMoved:            false,
    }
    dragTypeRef.current = type
  }, [isReady, getHitType, containerRef])

  // ── Drag move ─────────────────────────────────────────────────────────────

  const moveDrag = useCallback((clientX: number, pointerId: number) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== pointerId) return

    drag.latestClientX = clientX
    if (Math.abs(clientX - drag.startClientX) > DRAG_THRESHOLD_PX) {
      drag.hasMoved = true
    }
    if (!drag.hasMoved) return

    // Throttle store writes to one per animation frame
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const d = dragRef.current
      if (!d) return
      const c = containerRef.current
      if (!c) return

      const dur   = durationRef.current
      const state = useAudioStore.getState()
      const t     = clientXToTime(d.latestClientX, c, dur)

      const { start, end } = computeNewSelection(
        d.type, t, d.startTime,
        d.selStartAtDragBegin, d.selEndAtDragBegin,
        dur, state.fixedDuration,
      )

      state.setSelection({ start, end, duration: end - start })
    })
  }, [containerRef])

  // ── Drag end ──────────────────────────────────────────────────────────────

  const endDrag = useCallback((clientX: number, pointerId: number) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== pointerId) return

    if (!drag.hasMoved) {
      // Bare click: seek to the tapped position and clear selection
      const c = containerRef.current
      if (c) {
        const time = clientXToTime(clientX, c, durationRef.current)
        useAudioStore.getState().setSelection(null)
        seekToRef.current(time)
      }
    } else if (drag.type === 'create') {
      // Discard tiny accidental drags
      const sel = useAudioStore.getState().selection
      if (!sel || (sel.end - sel.start) < SELECTION_MIN_DURATION) {
        useAudioStore.getState().setSelection(null)
      }
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    dragRef.current    = null
    dragTypeRef.current = null
  }, [containerRef])

  return { dragTypeRef, startDrag, moveDrag, endDrag, getCursor }
}
