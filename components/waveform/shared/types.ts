/**
 * Shared types for the waveform selection system.
 * Used by both desktop and mobile implementations.
 */

/** The four kinds of drag interaction on the selection */
export type DragType = 'create' | 'move' | 'resize-left' | 'resize-right'

/** Internal state tracked per active pointer drag */
export interface DragState {
  type: DragType
  /** Pointer that owns this drag (handles multi-touch correctly) */
  pointerId: number
  startClientX: number
  latestClientX: number
  /** Audio time (seconds) at drag start position */
  startTime: number
  selStartAtDragBegin: number
  selEndAtDragBegin: number
  /** True once the pointer has moved past the drag threshold */
  hasMoved: boolean
}

/** Minimal selection shape used by pure utility functions */
export interface SelectionBounds {
  start: number
  end: number
}
