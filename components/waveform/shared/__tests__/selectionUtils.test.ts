import { describe, it, expect } from 'vitest'
import {
  clamp,
  clientXToTime,
  timeToPct,
  hitTest,
  computeNewSelection,
  getCursorForState,
  SELECTION_MIN_DURATION,
  DRAG_THRESHOLD_PX,
} from '../selectionUtils'
import type { SelectionBounds } from '../types'

// ── Mock helpers ──────────────────────────────────────────────────────────────

/**
 * Creates a minimal HTMLDivElement-like mock with deterministic geometry.
 *   scrollWidth  — full waveform content width (canvas × zoom)
 *   scrollLeft   — current horizontal scroll position
 *   rectLeft     — container's left offset from viewport
 */
function makeContainer({
  scrollWidth = 1000,
  scrollLeft  = 0,
  rectLeft    = 0,
}: { scrollWidth?: number; scrollLeft?: number; rectLeft?: number } = {}): HTMLDivElement {
  return {
    scrollWidth,
    scrollLeft,
    getBoundingClientRect: () =>
      ({ left: rectLeft, top: 0, right: rectLeft + scrollWidth, bottom: 100, width: scrollWidth, height: 100 } as DOMRect),
  } as unknown as HTMLDivElement
}

// Default fixture: selection 20 s → 40 s over 100 s audio at 1000 px scrollWidth
// start → 200 px, end → 400 px
const SEL: SelectionBounds = { start: 20, end: 40 }
const DURATION = 100
const CONTAINER = makeContainer({ scrollWidth: 1000 })

// ── clamp ─────────────────────────────────────────────────────────────────────

describe('clamp', () => {
  it('returns value when within range', () => expect(clamp(0, 10, 5)).toBe(5))
  it('clamps to min', () => expect(clamp(0, 10, -3)).toBe(0))
  it('clamps to max', () => expect(clamp(0, 10, 15)).toBe(10))
  it('handles min === max', () => expect(clamp(5, 5, 3)).toBe(5))
  it('handles negative ranges', () => expect(clamp(-10, -2, -5)).toBe(-5))
})

// ── clientXToTime ─────────────────────────────────────────────────────────────

describe('clientXToTime', () => {
  it('maps left edge to 0', () =>
    expect(clientXToTime(0, CONTAINER, DURATION)).toBe(0))
  it('maps right edge to duration', () =>
    expect(clientXToTime(1000, CONTAINER, DURATION)).toBe(100))
  it('maps midpoint correctly', () =>
    expect(clientXToTime(500, CONTAINER, DURATION)).toBe(50))
  it('clamps negative clientX to 0', () =>
    expect(clientXToTime(-50, CONTAINER, DURATION)).toBe(0))
  it('clamps beyond scrollWidth to duration', () =>
    expect(clientXToTime(1100, CONTAINER, DURATION)).toBe(100))

  it('accounts for horizontal scroll (scrollLeft)', () => {
    const c = makeContainer({ scrollWidth: 1000, scrollLeft: 200 })
    // absX = 300 - 0 + 200 = 500 → 50 s
    expect(clientXToTime(300, c, 100)).toBe(50)
  })

  it('accounts for container left viewport offset (rectLeft)', () => {
    const c = makeContainer({ scrollWidth: 1000, rectLeft: 100 })
    // absX = 600 - 100 + 0 = 500 → 50 s
    expect(clientXToTime(600, c, 100)).toBe(50)
  })

  it('combines scrollLeft and rectLeft correctly', () => {
    const c = makeContainer({ scrollWidth: 1000, scrollLeft: 100, rectLeft: 50 })
    // absX = 450 - 50 + 100 = 500 → 50 s
    expect(clientXToTime(450, c, 100)).toBe(50)
  })

  it('returns 0 when duration is 0', () =>
    expect(clientXToTime(500, CONTAINER, 0)).toBe(0))
})

// ── timeToPct ─────────────────────────────────────────────────────────────────

describe('timeToPct', () => {
  it('returns 0 for time = 0', () =>
    expect(timeToPct(0, 100)).toBe(0))
  it('returns 100 for time = duration', () =>
    expect(timeToPct(100, 100)).toBe(100))
  it('returns 50 for midpoint', () =>
    expect(timeToPct(50, 100)).toBe(50))
  it('returns 0 when duration is 0', () =>
    expect(timeToPct(50, 0)).toBe(0))
})

// ── hitTest ───────────────────────────────────────────────────────────────────

describe('hitTest', () => {
  // Fixture: scrollWidth=1000, duration=100 s
  // SEL: start=20 s → 200 px  |  end=40 s → 400 px

  // ── Desktop (handleHitPx = 16) ───────────────────────────────────────────

  describe('desktop — handleHitPx = 16', () => {
    const HIT = 16

    it('detects left handle at its centre (200 px)', () =>
      expect(hitTest(200, CONTAINER, SEL, DURATION, false, HIT)).toBe('resize-left'))
    it('detects left handle at leading edge of hit zone (200 - 15 px)', () =>
      expect(hitTest(185, CONTAINER, SEL, DURATION, false, HIT)).toBe('resize-left'))
    it('detects left handle at trailing edge of hit zone (200 + 15 px)', () =>
      expect(hitTest(215, CONTAINER, SEL, DURATION, false, HIT)).toBe('resize-left'))
    it('misses 1 px outside left handle hit zone', () =>
      expect(hitTest(183, CONTAINER, SEL, DURATION, false, HIT)).toBeNull())

    it('detects right handle at its centre (400 px)', () =>
      expect(hitTest(400, CONTAINER, SEL, DURATION, false, HIT)).toBe('resize-right'))
    it('detects right handle within hit zone (400 + 15 px)', () =>
      expect(hitTest(415, CONTAINER, SEL, DURATION, false, HIT)).toBe('resize-right'))
    it('misses 1 px outside right handle hit zone', () =>
      expect(hitTest(417, CONTAINER, SEL, DURATION, false, HIT)).toBeNull())

    it('detects body (middle of selection) as move', () =>
      expect(hitTest(300, CONTAINER, SEL, DURATION, false, HIT)).toBe('move'))
    it('returns null outside selection', () =>
      expect(hitTest(600, CONTAINER, SEL, DURATION, false, HIT)).toBeNull())
    it('returns null before selection', () =>
      expect(hitTest(100, CONTAINER, SEL, DURATION, false, HIT)).toBeNull())
    it('returns null when selection is null', () =>
      expect(hitTest(300, CONTAINER, null, DURATION, false, HIT)).toBeNull())
  })

  // ── Mobile (handleHitPx = 28) ────────────────────────────────────────────

  describe('mobile — handleHitPx = 28 (larger touch targets)', () => {
    const HIT = 28

    it('detects left handle at its centre', () =>
      expect(hitTest(200, CONTAINER, SEL, DURATION, false, HIT)).toBe('resize-left'))
    it('detects left handle 27 px to the left (within touch zone)', () =>
      expect(hitTest(173, CONTAINER, SEL, DURATION, false, HIT)).toBe('resize-left'))
    it('detects left handle 27 px to the right (within touch zone)', () =>
      expect(hitTest(227, CONTAINER, SEL, DURATION, false, HIT)).toBe('resize-left'))
    it('misses 1 px beyond mobile touch zone', () =>
      expect(hitTest(171, CONTAINER, SEL, DURATION, false, HIT)).toBeNull())

    it('detects right handle 27 px to the right', () =>
      expect(hitTest(427, CONTAINER, SEL, DURATION, false, HIT)).toBe('resize-right'))
    it('detects right handle 27 px to the left', () =>
      expect(hitTest(373, CONTAINER, SEL, DURATION, false, HIT)).toBe('resize-right'))

    // Key contrast: coordinate that desktop misses but mobile catches
    it('catches near-handle at 20 px offset that 16 px desktop radius would miss', () => {
      const px = 220  // 20 px right of left handle centre
      expect(hitTest(px, CONTAINER, SEL, DURATION, false, 16)).toBe('move')       // desktop: body
      expect(hitTest(px, CONTAINER, SEL, DURATION, false, 28)).toBe('resize-left') // mobile: handle
    })

    it('body zone is narrower in mobile (229 px … 371 px)', () => {
      // Handle zone: |absX - 200| ≤ 28  → [172, 228]  (inclusive)
      // Body zone:   absX > 228 AND absX < 372         (exclusive boundaries)
      expect(hitTest(229, CONTAINER, SEL, DURATION, false, HIT)).toBe('move')
      expect(hitTest(300, CONTAINER, SEL, DURATION, false, HIT)).toBe('move')
      expect(hitTest(371, CONTAINER, SEL, DURATION, false, HIT)).toBe('move')
    })
  })

  // ── Fixed-duration mode ──────────────────────────────────────────────────

  describe('fixed-duration mode', () => {
    const HIT = 16

    it('handle touch returns move instead of resize-left', () =>
      expect(hitTest(200, CONTAINER, SEL, DURATION, true, HIT)).toBe('move'))
    it('handle touch returns move instead of resize-right', () =>
      expect(hitTest(400, CONTAINER, SEL, DURATION, true, HIT)).toBe('move'))
    it('body still returns move', () =>
      expect(hitTest(300, CONTAINER, SEL, DURATION, true, HIT)).toBe('move'))
    it('outside returns null', () =>
      expect(hitTest(600, CONTAINER, SEL, DURATION, true, HIT)).toBeNull())
  })
})

// ── computeNewSelection ───────────────────────────────────────────────────────

describe('computeNewSelection', () => {

  describe('create', () => {
    it('forward drag: creates selection from startTime to currentTime', () => {
      const r = computeNewSelection('create', 60, 30, 0, 0, DURATION, null)
      expect(r).toEqual({ start: 30, end: 60 })
    })
    it('backward drag: start is the smaller time', () => {
      const r = computeNewSelection('create', 20, 50, 0, 0, DURATION, null)
      expect(r).toEqual({ start: 20, end: 50 })
    })
    it('creates fixed-duration window anchored at currentTime', () => {
      const r = computeNewSelection('create', 55, 30, 0, 0, DURATION, 20)
      expect(r).toEqual({ start: 55, end: 75 })
    })
    it('clamps fixed-duration window when near end of audio', () => {
      const r = computeNewSelection('create', 90, 30, 0, 0, DURATION, 20)
      expect(r).toEqual({ start: 80, end: 100 })
    })
    it('clamps fixed-duration window at audio start', () => {
      const r = computeNewSelection('create', -5, 30, 0, 0, DURATION, 20)
      expect(r).toEqual({ start: 0, end: 20 })
    })
  })

  describe('move', () => {
    it('shifts selection preserving duration', () => {
      // startTime=30, currentTime=50 → offset=+20 → selStart 20→40, selEnd 40→60
      const r = computeNewSelection('move', 50, 30, 20, 40, DURATION, null)
      expect(r).toEqual({ start: 40, end: 60 })
    })
    it('shifts selection in the negative direction', () => {
      const r = computeNewSelection('move', 10, 30, 20, 40, DURATION, null)
      expect(r).toEqual({ start: 0, end: 20 })
    })
    it('clamps at audio start (start cannot go below 0)', () => {
      const r = computeNewSelection('move', -20, 30, 20, 40, DURATION, null)
      expect(r).toEqual({ start: 0, end: 20 })
    })
    it('clamps at audio end (end cannot exceed duration)', () => {
      const r = computeNewSelection('move', 120, 30, 20, 40, DURATION, null)
      expect(r).toEqual({ start: 80, end: 100 })
    })
    it('preserves selection length when clamped', () => {
      const r = computeNewSelection('move', 120, 30, 20, 40, DURATION, null)
      expect(r.end - r.start).toBe(20)
    })
  })

  describe('resize-left (mobile and desktop)', () => {
    it('moves start boundary inward (makes selection shorter)', () => {
      const r = computeNewSelection('resize-left', 25, 20, 20, 40, DURATION, null)
      expect(r).toEqual({ start: 25, end: 40 })
    })
    it('moves start boundary outward (makes selection longer)', () => {
      const r = computeNewSelection('resize-left', 10, 20, 20, 40, DURATION, null)
      expect(r).toEqual({ start: 10, end: 40 })
    })
    it('clamps start at audio beginning', () => {
      const r = computeNewSelection('resize-left', -5, 20, 20, 40, DURATION, null)
      expect(r).toEqual({ start: 0, end: 40 })
    })
    it(`enforces SELECTION_MIN_DURATION (${SELECTION_MIN_DURATION} s) — start cannot pass end`, () => {
      const r = computeNewSelection('resize-left', 45, 20, 20, 40, DURATION, null)
      expect(r.start).toBeCloseTo(40 - SELECTION_MIN_DURATION)
      expect(r.end).toBe(40)
    })
    it('end boundary stays fixed during resize-left', () => {
      const r = computeNewSelection('resize-left', 30, 20, 20, 40, DURATION, null)
      expect(r.end).toBe(40)
    })
    it('start at extreme left (0 s)', () => {
      const r = computeNewSelection('resize-left', 0, 20, 20, 40, DURATION, null)
      expect(r.start).toBe(0)
    })
  })

  describe('resize-right (mobile and desktop)', () => {
    it('moves end boundary outward (makes selection longer)', () => {
      const r = computeNewSelection('resize-right', 60, 40, 20, 40, DURATION, null)
      expect(r).toEqual({ start: 20, end: 60 })
    })
    it('moves end boundary inward (makes selection shorter)', () => {
      const r = computeNewSelection('resize-right', 30, 40, 20, 40, DURATION, null)
      expect(r).toEqual({ start: 20, end: 30 })
    })
    it('clamps end at audio duration', () => {
      const r = computeNewSelection('resize-right', 110, 40, 20, 40, DURATION, null)
      expect(r).toEqual({ start: 20, end: 100 })
    })
    it(`enforces SELECTION_MIN_DURATION (${SELECTION_MIN_DURATION} s) — end cannot pass start`, () => {
      const r = computeNewSelection('resize-right', 15, 40, 20, 40, DURATION, null)
      expect(r.start).toBe(20)
      expect(r.end).toBeCloseTo(20 + SELECTION_MIN_DURATION)
    })
    it('start boundary stays fixed during resize-right', () => {
      const r = computeNewSelection('resize-right', 50, 40, 20, 40, DURATION, null)
      expect(r.start).toBe(20)
    })
    it('end at extreme right (duration)', () => {
      const r = computeNewSelection('resize-right', DURATION, 40, 20, 40, DURATION, null)
      expect(r.end).toBe(DURATION)
    })
  })

  describe('constants', () => {
    it('SELECTION_MIN_DURATION > 0', () =>
      expect(SELECTION_MIN_DURATION).toBeGreaterThan(0))
    it('DRAG_THRESHOLD_PX > 0', () =>
      expect(DRAG_THRESHOLD_PX).toBeGreaterThan(0))
  })

  // ── Mobile vs desktop interaction ────────────────────────────────────────

  describe('mobile vs desktop — same pixel produces different drag type and result', () => {
    it('px 220 → desktop: move (body zone),  mobile: resize-left (handle zone)', () => {
      const px = 220  // 20 px right of left-handle centre at 200 px
      expect(hitTest(px, CONTAINER, SEL, DURATION, false, 16)).toBe('move')
      expect(hitTest(px, CONTAINER, SEL, DURATION, false, 28)).toBe('resize-left')
    })

    it('desktop move → length is preserved; mobile resize-left → end stays fixed', () => {
      const px = 220
      const desktopDrag = hitTest(px, CONTAINER, SEL, DURATION, false, 16)!
      const mobileDrag  = hitTest(px, CONTAINER, SEL, DURATION, false, 28)!

      const deskResult = computeNewSelection(desktopDrag, 22, 21, 20, 40, DURATION, null)
      expect(deskResult.end - deskResult.start).toBe(20)  // length preserved

      const mobResult = computeNewSelection(mobileDrag, 22, 21, 20, 40, DURATION, null)
      expect(mobResult.end).toBe(40)   // end fixed
      expect(mobResult.start).toBe(22) // start follows finger
    })

    it('resize-left: overlay fill left edge = startPct% regardless of who moves it', () => {
      // Resize-left moves start → overlay fill left edge must equal new start %
      const r = computeNewSelection('resize-left', 28, 20, 20, 40, DURATION, null)
      const expectedPct = timeToPct(r.start, DURATION)
      // overlap fill: left = startPct%, so left pixel = expectedPct * W / 100
      expect(expectedPct).toBeCloseTo(timeToPct(r.start, DURATION))
    })

    it('resize-right: overlay fill right edge = endPct% regardless of who moves it', () => {
      const r = computeNewSelection('resize-right', 65, 40, 20, 40, DURATION, null)
      const expectedPct = timeToPct(r.end, DURATION)
      expect(expectedPct).toBeCloseTo(timeToPct(r.end, DURATION))
    })
  })
})

// ── getCursorForState ─────────────────────────────────────────────────────────

describe('getCursorForState', () => {
  describe('active drag takes precedence', () => {
    it('move drag → grabbing', () =>
      expect(getCursorForState('move', null)).toBe('grabbing'))
    it('resize-left drag → ew-resize', () =>
      expect(getCursorForState('resize-left', null)).toBe('ew-resize'))
    it('resize-right drag → ew-resize', () =>
      expect(getCursorForState('resize-right', null)).toBe('ew-resize'))
    it('create drag → crosshair', () =>
      expect(getCursorForState('create', null)).toBe('crosshair'))
    it('active drag overrides hover hit', () =>
      expect(getCursorForState('move', 'resize-left')).toBe('grabbing'))
  })

  describe('hover (no active drag)', () => {
    it('hover over move zone → grab', () =>
      expect(getCursorForState(null, 'move')).toBe('grab'))
    it('hover over left handle → ew-resize', () =>
      expect(getCursorForState(null, 'resize-left')).toBe('ew-resize'))
    it('hover over right handle → ew-resize', () =>
      expect(getCursorForState(null, 'resize-right')).toBe('ew-resize'))
    it('no hit → crosshair', () =>
      expect(getCursorForState(null, null)).toBe('crosshair'))
  })
})
