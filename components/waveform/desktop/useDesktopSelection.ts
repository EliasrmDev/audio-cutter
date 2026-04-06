'use client'

/**
 * useDesktopSelection
 *
 * Wires Pointer Events (mouse only) to the shared useSelectionLogic engine.
 *
 * Desktop-specific behaviours:
 *  • Responds only to pointerType === 'mouse'
 *  • Small handle hit radius (16 px) — comfortable for a cursor
 *  • Live cursor feedback on hover
 *  • Pointer capture so dragging outside the overlay keeps firing events
 */

import { useCallback, useState } from 'react'
import { useSelectionLogic } from '../shared/useSelectionLogic'

/** Mouse handle hit radius — 16 px is comfortable for cursor precision */
const HANDLE_HIT_PX = 16

export interface UseDesktopSelectionOptions {
  containerRef: React.RefObject<HTMLDivElement>
  duration: number
  isReady: boolean
  seekTo: (t: number) => void
}

export interface UseDesktopSelectionReturn {
  /** Current CSS cursor string — apply to the overlay div */
  cursor: string
  onPointerDown:   (e: React.PointerEvent<HTMLElement>) => void
  onPointerMove:   (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp:     (e: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void
  onPointerLeave:  (e: React.PointerEvent<HTMLElement>) => void
}

export function useDesktopSelection({
  containerRef,
  duration,
  isReady,
  seekTo,
}: UseDesktopSelectionOptions): UseDesktopSelectionReturn {
  const { dragTypeRef, startDrag, moveDrag, endDrag, getCursor } = useSelectionLogic({
    containerRef,
    duration,
    isReady,
    seekTo,
    handleHitPx: HANDLE_HIT_PX,
  })

  const [cursor, setCursor] = useState<string>('crosshair')

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return
    if (e.button !== 0) return  // left-click only
    e.preventDefault()
    // Pointer capture: events keep firing even when the pointer leaves the overlay
    ;(e.target as Element).setPointerCapture(e.pointerId)
    startDrag(e.clientX, e.pointerId)
    setCursor(getCursor(e.clientX))
  }, [startDrag, getCursor])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return
    moveDrag(e.clientX, e.pointerId)
    setCursor(getCursor(e.clientX))
  }, [moveDrag, getCursor])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return
    endDrag(e.clientX, e.pointerId)
    setCursor(getCursor(e.clientX))
  }, [endDrag, getCursor])

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return
    endDrag(e.clientX, e.pointerId)
    setCursor('crosshair')
  }, [endDrag])

  const onPointerLeave = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return
    // Keep current cursor while dragging; reset when idle
    if (!dragTypeRef.current) setCursor('crosshair')
  }, [dragTypeRef])

  return {
    cursor,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
  }
}
