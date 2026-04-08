'use client'

/**
 * useMobileSelection
 *
 * Wires Pointer Events (touch only) to the shared useSelectionLogic engine.
 *
 * Mobile-specific behaviours:
 *  • Responds only to pointerType === 'touch' (or 'pen')
 *  • Large handle hit radius (28 px) for fat-finger accuracy
 *  • touch-action: none on the overlay prevents browser scroll conflicts
 *    during an active selection drag
 *  • No cursor state (cursors are meaningless on touch screens)
 */

import { useCallback } from 'react'
import { useSelectionLogic } from '../shared/useSelectionLogic'

/** Touch handle hit radius — 28 px accommodates most finger sizes */
const HANDLE_HIT_PX = 28

export interface UseMobileSelectionOptions {
  containerRef: React.RefObject<HTMLDivElement>
  duration: number
  isReady: boolean
  seekTo: (t: number) => void
}

export interface UseMobileSelectionReturn {
  onPointerDown:   (e: React.PointerEvent<HTMLElement>) => void
  onPointerMove:   (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp:     (e: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void
  /** Abort the active drag without committing — called when pinch starts */
  cancelDrag:      () => void
}

export function useMobileSelection({
  containerRef,
  duration,
  isReady,
  seekTo,
}: UseMobileSelectionOptions): UseMobileSelectionReturn {
  const { startDrag, moveDrag, endDrag, cancelDrag } = useSelectionLogic({
    containerRef,
    duration,
    isReady,
    seekTo,
    handleHitPx: HANDLE_HIT_PX,
  })

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    // Ignore mouse events — the DesktopSelectionLayer handles those
    if (e.pointerType === 'mouse') return
    e.preventDefault()
    // Pointer capture keeps move/up events flowing even if finger drifts off
    ;(e.target as Element).setPointerCapture(e.pointerId)
    startDrag(e.clientX, e.pointerId)
  }, [startDrag])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') return
    moveDrag(e.clientX, e.pointerId)
  }, [moveDrag])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') return
    endDrag(e.clientX, e.pointerId)
  }, [endDrag])

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') return
    endDrag(e.clientX, e.pointerId)
  }, [endDrag])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, cancelDrag }
}
