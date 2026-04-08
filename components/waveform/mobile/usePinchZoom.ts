'use client'

/**
 * usePinchZoom
 *
 * Detects two-finger pinch gestures on touch devices and drives waveform zoom.
 *
 * Mobile-specific behaviours:
 *  • Ignores mouse pointers entirely
 *  • Activates when ≥ 2 touch pointers are on screen
 *  • Computes zoom from the ratio of new/old inter-finger distance (rAF-throttled)
 *  • Zoom is centred on the midpoint between the two fingers
 *  • Exposes isPinchingRef so the selection hook can pause during pinch
 *  • Calls onPinchStateChange(true/false) synchronously — use it to cancelDrag
 *
 * Does NOT attach events itself — returns handlers for MobileSelectionLayer.
 */

import { useCallback, useRef } from 'react'
import {
  clampZoom,
  pinchDistance,
  zoomFromPinch,
  scrollAfterZoom,
} from '../shared/zoomUtils'

/** Ignore pinch gestures where fingers are closer than this (avoids jitter) */
const MIN_PINCH_DIST = 8 // px

export interface UsePinchZoomOptions {
  /** Scrollable waveform container — needed for scroll-centering */
  containerRef: React.RefObject<HTMLDivElement>
  /** Current zoom level in px/s (from WaveformContext) */
  zoom: number
  /** Apply new zoom level (calls wavesurfer.zoom internally) */
  setZoom: (zoom: number) => void
  /**
   * Called synchronously when pinch starts (true) or ends (false).
   * Use this to cancel an active selection drag.
   */
  onPinchStateChange?: (isPinching: boolean) => void
}

export interface UsePinchZoomReturn {
  /** Mutable ref — read synchronously inside event handlers to check pinch state */
  isPinchingRef:  React.MutableRefObject<boolean>
  onPointerDown:   (e: React.PointerEvent) => void
  onPointerMove:   (e: React.PointerEvent) => void
  onPointerUp:     (e: React.PointerEvent) => void
  onPointerCancel: (e: React.PointerEvent) => void
}

export function usePinchZoom({
  containerRef,
  zoom,
  setZoom,
  onPinchStateChange,
}: UsePinchZoomOptions): UsePinchZoomReturn {
  // Live pointer positions (all active touch pointers)
  const pointersRef    = useRef<Map<number, { x: number; y: number }>>(new Map())
  /** Distance between the two fingers at the last processed frame */
  const prevDistRef    = useRef<number>(0)
  /**
   * Zoom value tracked inside rAF closures — avoids stale React state.
   * Updated after every setZoom call so successive pinch frames are accurate.
   */
  const activeZoomRef  = useRef<number>(zoom)
  const rafRef         = useRef<number | null>(null)
  const isPinchingRef  = useRef<boolean>(false)

  // Keep activeZoomRef current without triggering re-renders
  activeZoomRef.current = zoom

  // ── Internal helpers ──────────────────────────────────────────────────────

  const setPinching = useCallback((pinching: boolean) => {
    isPinchingRef.current = pinching
    onPinchStateChange?.(pinching)
  }, [onPinchStateChange])

  const getTwoPoints = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
    const pts = Array.from(pointersRef.current.values())
    if (pts.length < 2) return null
    return [pts[0], pts[1]]
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2) {
      // Second finger landed — start pinch
      const pts = getTwoPoints()
      if (pts) {
        prevDistRef.current  = pinchDistance(pts[0].x, pts[0].y, pts[1].x, pts[1].y)
        activeZoomRef.current = zoom   // snapshot before pinch begins
      }
      setPinching(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, setPinching])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return
    if (!pointersRef.current.has(e.pointerId)) return

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (!isPinchingRef.current) return
    if (rafRef.current !== null) return  // already a frame scheduled

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null

      const pts = getTwoPoints()
      if (!pts) return

      const [p1, p2]    = pts
      const newDist     = pinchDistance(p1.x, p1.y, p2.x, p2.y)
      if (newDist < MIN_PINCH_DIST) return

      const prevDist    = prevDistRef.current
      const currentZoom = activeZoomRef.current
      const newZoom     = zoomFromPinch(prevDist, newDist, currentZoom)

      if (newZoom === currentZoom) {
        prevDistRef.current = newDist
        return
      }

      const container   = containerRef.current
      const midX        = (p1.x + p2.x) / 2
      const oldScrollLeft = container?.scrollLeft ?? 0

      // 1. Apply zoom (synchronously calls wavesurfer.zoom → changes scrollWidth)
      setZoom(newZoom)

      // 2. Adjust scroll so the pinch midpoint stays in place
      if (container) {
        scrollAfterZoom(container, midX, oldScrollLeft, currentZoom, newZoom)
      }

      prevDistRef.current   = newDist
      activeZoomRef.current = newZoom
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, setZoom])

  const removePointer = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return

    pointersRef.current.delete(e.pointerId)

    // Cancel any pending rAF
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    const remaining = pointersRef.current.size
    if (remaining < 2) {
      // Pinch ended (0 or 1 fingers remain)
      setPinching(false)
      prevDistRef.current = 0
    } else {
      // ≥ 3 fingers → one lifted, still pinching; reset reference distance
      const pts = getTwoPoints()
      if (pts) {
        prevDistRef.current = pinchDistance(pts[0].x, pts[0].y, pts[1].x, pts[1].y)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPinching])

  return {
    isPinchingRef,
    onPointerDown,
    onPointerMove,
    onPointerUp:     removePointer,
    onPointerCancel: removePointer,
  }
}
