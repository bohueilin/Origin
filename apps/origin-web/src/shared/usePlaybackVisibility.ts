import { useEffect, useState, type RefObject } from 'react'

/** Playback advances only while its surface is visible in the active tab. Visibility may
 *  pause a playback, never start one: callers start motion only from a visitor's click. */
export function usePlaybackVisibility(target: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const element = target.current
    if (!element) return
    let intersects = false
    const update = () => setVisible(intersects && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => {
      intersects = entry.isIntersecting
      update()
    })
    observer.observe(element)
    document.addEventListener('visibilitychange', update)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
    }
  }, [target])
  return visible
}
