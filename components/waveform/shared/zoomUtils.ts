/**
 * zoomUtils — pure, side-effect-free math for the zoom system.
 *
 * No React, no DOM events, no Zustand. Import freely in both desktop and
 * mobile code paths and in unit tests.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const ZOOM_MIN     = 10
export const ZOOM_MAX     = 500
export const ZOOM_DEFAULT = 60

// ── Core math ─────────────────────────────────────────────────────────────────

/** Clamp zoom to valid [ZOOM_MIN, ZOOM_MAX] range, guarding against NaN/Infinity */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return ZOOM_DEFAULT
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(zoom)))
}

/** Euclidean distance between two pointer positions (px) */
export function pinchDistance(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  return Math.hypot(x2 - x1, y2 - y1)
}

/**
 * Calculate new zoom from a pinch gesture.
 *
 * @param prevDist    Distance between fingers at last frame
 * @param newDist     Distance between fingers now
 * @param currentZoom Current zoom level in px/s
 */
export function zoomFromPinch(
  prevDist: number,
  newDist: number,
  currentZoom: number,
): number {
  if (prevDist <= 0 || !Number.isFinite(newDist)) return currentZoom
  const scaleFactor = newDist / prevDist
  return clampZoom(currentZoom * scaleFactor)
}

// ── Scroll centering ──────────────────────────────────────────────────────────

/**
 * After applying a zoom change to the waveform, adjust the container's
 * scrollLeft so the anchor point (cursor position or pinch midpoint) remains
 * visually stable.
 *
 * ⚠️  Call this AFTER wavesurfer.zoom() has changed the canvas width so that
 * the browser's scrollWidth already reflects the new zoom level.
 *
 * @param container     The scrollable waveform container element
 * @param anchorClientX Client X of the zoom anchor (cursor or pinch midpoint)
 * @param oldScrollLeft container.scrollLeft captured BEFORE zoom was applied
 * @param oldZoom       Zoom level before the change (px/s)
 * @param newZoom       Zoom level after the change (px/s)
 */
export function scrollAfterZoom(
  container: HTMLDivElement,
  anchorClientX: number,
  oldScrollLeft: number,
  oldZoom: number,
  newZoom: number,
): void {
  if (oldZoom <= 0 || newZoom === oldZoom || !Number.isFinite(newZoom)) return
  const rect        = container.getBoundingClientRect()
  const localX      = anchorClientX - rect.left        // px from left edge of viewport
  const absX        = oldScrollLeft + localX           // absolute position in old scroll space
  const scaleFactor = newZoom / oldZoom
  container.scrollLeft = Math.max(0, absX * scaleFactor - localX)
}
