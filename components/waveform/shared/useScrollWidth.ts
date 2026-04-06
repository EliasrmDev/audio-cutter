'use client'

/**
 * useScrollWidth
 *
 * Tracks the scrollWidth of a container element using a ResizeObserver.
 * Returns 0 while the container is not yet ready.
 *
 * Both DesktopSelectionLayer and MobileSelectionLayer use this hook so
 * that their handle positions stay in sync with the waveform scroll content
 * even when the user zooms in or out.
 */

import { useEffect, useState } from 'react'

export function useScrollWidth(
  containerRef: React.RefObject<HTMLDivElement>,
  isReady: boolean,
  /** Pass `zoom` as a dep so the effect re-runs when zoom changes */
  zoom: number,
): number {
  const [scrollWidth, setScrollWidth] = useState(0)

  useEffect(() => {
    const c = containerRef.current
    if (!c || !isReady) return

    const update = () => setScrollWidth(c.scrollWidth)
    update()

    const ro = new ResizeObserver(update)
    ro.observe(c)
    // Also observe WaveSurfer's inner wrapper div if present
    if (c.firstElementChild) ro.observe(c.firstElementChild)

    return () => ro.disconnect()
  }, [containerRef, isReady, zoom])

  return scrollWidth
}
