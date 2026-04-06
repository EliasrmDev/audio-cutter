/**
 * selectionUtils — pure, side-effect-free math for the selection system.
 *
 * No React, no DOM events, no Zustand.  Import freely in both desktop and
 * mobile code paths and in unit tests.
 */

import type { DragType, SelectionBounds } from './types'

// ── Constants ────────────────────────────────────────────────────────────────

/** Minimum selection length in seconds — prevents zero-length accidents */
export const SELECTION_MIN_DURATION = 0.5

/** Pixels of movement required before a pointerdown becomes a real drag */
export const DRAG_THRESHOLD_PX = 4

// ── Core math ────────────────────────────────────────────────────────────────

export function clamp(min: number, max: number, val: number): number {
  return Math.max(min, Math.min(max, val))
}

/**
 * Convert a screen clientX coordinate to an audio time in seconds.
 * Accounts for horizontal scroll inside the container.
 */
export function clientXToTime(
  clientX: number,
  container: HTMLDivElement,
  duration: number,
): number {
  if (duration <= 0) return 0
  const rect = container.getBoundingClientRect()
  const absX = clientX - rect.left + container.scrollLeft
  return clamp(0, duration, (absX / container.scrollWidth) * duration)
}

/**
 * Convert an audio time to a percentage position within the scroll area.
 * Use in CSS: `left: ${timeToPct(t, d)}%`
 */
export function timeToPct(time: number, duration: number): number {
  if (duration <= 0) return 0
  return (time / duration) * 100
}

// ── Hit testing ───────────────────────────────────────────────────────────

/**
 * Given a screen clientX, determine what drag action should start.
 *
 * Returns:
 *  - 'resize-left' / 'resize-right' — pointer is on a handle
 *  - 'move'  — pointer is inside the selection body
 *  - null    — pointer is outside (caller should treat as 'create')
 *
 * In fixed-duration mode the resize handles are treated as 'move'.
 */
export function hitTest(
  clientX: number,
  container: HTMLDivElement,
  selection: SelectionBounds | null,
  duration: number,
  isFixed: boolean,
  handleHitPx: number,
): DragType | null {
  if (!selection || duration <= 0) return null

  const rect    = container.getBoundingClientRect()
  const absX    = clientX - rect.left + container.scrollLeft
  const totalW  = container.scrollWidth
  const startPx = (selection.start / duration) * totalW
  const endPx   = (selection.end   / duration) * totalW

  if (Math.abs(absX - startPx) <= handleHitPx) return isFixed ? 'move' : 'resize-left'
  if (Math.abs(absX - endPx)   <= handleHitPx) return isFixed ? 'move' : 'resize-right'
  if (absX > startPx + handleHitPx && absX < endPx - handleHitPx) return 'move'

  return null // outside selection → caller uses 'create'
}

// ── Selection arithmetic ──────────────────────────────────────────────────

/**
 * Compute updated selection bounds for an in-progress drag.
 *
 * Pure function — does not touch any store or DOM.
 */
export function computeNewSelection(
  dragType: DragType,
  currentTime: number,
  startTime: number,
  selStart: number,
  selEnd: number,
  duration: number,
  fixedDuration: number | null,
): SelectionBounds {
  let start = selStart
  let end   = selEnd

  if (dragType === 'create') {
    if (fixedDuration !== null) {
      start = clamp(0, duration - fixedDuration, currentTime)
      end   = start + fixedDuration
    } else {
      start = Math.min(startTime, currentTime)
      end   = Math.max(startTime, currentTime)
    }
  } else if (dragType === 'move') {
    const len    = selEnd - selStart
    const offset = currentTime - startTime
    start = clamp(0, duration - len, selStart + offset)
    end   = start + len
  } else if (dragType === 'resize-left') {
    start = clamp(0, selEnd - SELECTION_MIN_DURATION, currentTime)
    end   = selEnd
  } else {
    // resize-right
    start = selStart
    end   = clamp(selStart + SELECTION_MIN_DURATION, duration, currentTime)
  }

  return { start, end }
}

// ── Cursor ────────────────────────────────────────────────────────────────

/**
 * Return the appropriate CSS cursor string based on the current drag state
 * and the hover hit type.
 */
export function getCursorForState(
  activeDrag: DragType | null,
  hoverHit:   DragType | null,
): string {
  if (activeDrag === 'move')                                   return 'grabbing'
  if (activeDrag === 'resize-left' || activeDrag === 'resize-right') return 'ew-resize'
  if (activeDrag === 'create')                                 return 'crosshair'
  if (hoverHit === 'move')                                     return 'grab'
  if (hoverHit === 'resize-left' || hoverHit === 'resize-right') return 'ew-resize'
  return 'crosshair'
}
