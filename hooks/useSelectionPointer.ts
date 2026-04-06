'use client'

/**
 * useSelectionPointer
 *
 * Handles all pointer interaction for audio selection:
 *   • create  — drag on empty waveform → new selection
 *   • move    — drag on selection body → move whole window
 *   • resize-left  — drag left handle  → adjust start
 *   • resize-right — drag right handle → adjust end
 *
 * Uses Pointer Events (unified mouse + touch), pointer capture for
 * smooth cross-element dragging, and rAF throttling so the store is
 * updated at ≤60 fps regardless of how fast events fire.
 *
 * In fixed-duration mode the hook enforces the locked duration and
 * hides resize handles in favour of a move-only interaction.
 */

import { useCallback, useEffect, useRef } from 'react'
import { useAudioStore } from '@/store/useAudioStore'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum selection length in seconds (prevents zero-length accidents) */
export const SELECTION_MIN_DURATION = 0.5

/** Pixel radius around each handle edge that counts as a hit */
const HANDLE_HIT_PX = 16

/** Pixels of movement required before a pointerdown becomes a drag  */
const DRAG_THRESHOLD_PX = 4

// ── Types ─────────────────────────────────────────────────────────────────────

export type SelectionDragType = 'create' | 'move' | 'resize-left' | 'resize-right'

interface DragState {
  type: SelectionDragType
  pointerId: number
  startClientX: number
  latestClientX: number
  startTime: number
  selStartAtDragBegin: number
  selEndAtDragBegin: number
  hasMoved: boolean
}

export interface UseSelectionPointerOptions {
  /** Ref to the scrollable waveform container div */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Total audio duration in seconds */
  duration: number
  /** Whether WaveSurfer is initialised and ready */
  isReady: boolean
  /** Seek the playhead to a time (called on bare "click") */
  seekTo: (t: number) => void
}

export interface UseSelectionPointerReturn {
  /**
   * Mutable ref holding the active drag type (null when idle).
   * NOT reactive — read inside event handlers or rAF callbacks only.
   */
  dragTypeRef: React.MutableRefObject<SelectionDragType | null>
  /** Attach to the overlay element's onPointerDown */
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  /**
   * Returns the CSS cursor string appropriate for a screen X position.
   * Safe to call during render or onPointerMove for live cursor feedback.
   */
  getCursor: (clientX: number) => string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(min: number, max: number, val: number): number {
  return Math.max(min, Math.min(max, val))
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSelectionPointer({
  containerRef,
  duration,
  isReady,
  seekTo,
}: UseSelectionPointerOptions): UseSelectionPointerReturn {
  const dragRef    = useRef<DragState | null>(null)
  const rafRef     = useRef<number   | null>(null)
  const dragTypeRef = useRef<SelectionDragType | null>(null)

  // Keep latest values in refs so event handlers never stale-close over React state
  const durationRef = useRef(duration)
  useEffect(() => { durationRef.current = duration }, [duration])

  const seekToRef = useRef(seekTo)
  useEffect(() => { seekToRef.current = seekTo }, [seekTo])

  // ── Coordinate helpers ────────────────────────────────────────────────

  /** Convert a screen clientX → time in seconds, clamped to [0, duration]. */
  const clientXToTime = useCallback((clientX: number): number => {
    const c = containerRef.current
    const d = durationRef.current
    if (!c || d <= 0) return 0
    const rect    = c.getBoundingClientRect()
    const absX    = clientX - rect.left + c.scrollLeft
    return clamp(0, d, (absX / c.scrollWidth) * d)
  }, [containerRef])

  /**
   * Determine what action should start given a clientX.
   * Returns null when the pointer is outside any interactive zone.
   */
  const hitTest = useCallback((clientX: number): SelectionDragType | null => {
    const c       = containerRef.current
    const state   = useAudioStore.getState()
    const sel     = state.selection
    const d       = durationRef.current
    if (!c || !sel || d <= 0) return null

    const rect    = c.getBoundingClientRect()
    const absX    = clientX - rect.left + c.scrollLeft
    const totalW  = c.scrollWidth
    const startPx = (sel.start / d) * totalW
    const endPx   = (sel.end   / d) * totalW
    const isFixed = state.fixedDuration !== null

    // Handles — in fixed-duration mode treat them as 'move'
    if (Math.abs(absX - startPx) <= HANDLE_HIT_PX) return isFixed ? 'move' : 'resize-left'
    if (Math.abs(absX - endPx)   <= HANDLE_HIT_PX) return isFixed ? 'move' : 'resize-right'

    // Selection body
    if (absX > startPx + HANDLE_HIT_PX && absX < endPx - HANDLE_HIT_PX) return 'move'

    // Outside selection — start a 'create' (or move in fixed mode)
    return isFixed ? null : null   // null → create
  }, [containerRef])

  // ── Cursor feedback ───────────────────────────────────────────────────

  const getCursor = useCallback((clientX: number): string => {
    const active = dragTypeRef.current
    if (active === 'move')         return 'grabbing'
    if (active === 'resize-left' || active === 'resize-right') return 'ew-resize'
    if (active === 'create')       return 'crosshair'

    const hit = hitTest(clientX)
    if (hit === 'move')                               return 'grab'
    if (hit === 'resize-left' || hit === 'resize-right') return 'ew-resize'
    return 'crosshair'
  }, [hitTest])

  // ── Pointer down ──────────────────────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!isReady) return
    if (e.pointerType === 'mouse' && e.button !== 0) return   // left-click only
    e.preventDefault()

    const state     = useAudioStore.getState()
    const type      = hitTest(e.clientX) ?? 'create'
    const time      = clientXToTime(e.clientX)
    const sel       = state.selection

    dragRef.current = {
      type,
      pointerId:           e.pointerId,
      startClientX:        e.clientX,
      latestClientX:       e.clientX,
      startTime:           time,
      selStartAtDragBegin: sel?.start ?? time,
      selEndAtDragBegin:   sel?.end   ?? time,
      hasMoved:            false,
    }
    dragTypeRef.current = type

    // Pointer capture: events keep coming even if pointer leaves the element
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }, [isReady, hitTest, clientXToTime])

  // ── Global move / up ──────────────────────────────────────────────────

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return

      drag.latestClientX = e.clientX
      if (Math.abs(e.clientX - drag.startClientX) > DRAG_THRESHOLD_PX) {
        drag.hasMoved = true
      }
      if (!drag.hasMoved) return

      // Throttle store writes to one per animation frame
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const d = dragRef.current
        if (!d) return

        const dur   = durationRef.current
        const t     = clientXToTime(d.latestClientX)
        const state = useAudioStore.getState()
        let start: number
        let end:   number

        switch (d.type) {
          case 'create': {
            const fd = state.fixedDuration
            if (fd !== null) {
              // Fixed-duration: drag positions the window
              start = clamp(0, dur - fd, t)
              end   = start + fd
            } else {
              start = Math.min(d.startTime, t)
              end   = Math.max(d.startTime, t)
            }
            break
          }
          case 'move': {
            const len    = d.selEndAtDragBegin - d.selStartAtDragBegin
            const offset = t - d.startTime
            start = clamp(0, dur - len, d.selStartAtDragBegin + offset)
            end   = start + len
            break
          }
          case 'resize-left':
            start = clamp(0, d.selEndAtDragBegin - SELECTION_MIN_DURATION, t)
            end   = d.selEndAtDragBegin
            break
          case 'resize-right':
            start = d.selStartAtDragBegin
            end   = clamp(d.selStartAtDragBegin + SELECTION_MIN_DURATION, dur, t)
            break
          default:
            return
        }

        state.setSelection({ start, end, duration: end - start })
      })
    }

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return

      if (!drag.hasMoved) {
        // Bare click: seek to position and clear selection
        const time = clientXToTime(e.clientX)
        useAudioStore.getState().setSelection(null)
        seekToRef.current(time)
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
    }

    window.addEventListener('pointermove',   onMove)
    window.addEventListener('pointerup',     onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove',   onMove)
      window.removeEventListener('pointerup',     onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [clientXToTime])    // clientXToTime is stable (only containerRef dep)

  return { dragTypeRef, onPointerDown, getCursor }
}
