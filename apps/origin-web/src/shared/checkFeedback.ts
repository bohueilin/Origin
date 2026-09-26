import { useEffect, type RefObject } from 'react'

export function checkStamp(startedAt: number) {
  return {
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false }),
    elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
  }
}

export function useCheckVisibility(check: ReturnType<typeof checkStamp> | null, verdict: RefObject<HTMLElement | null>, mobileOnly = true) {
  useEffect(() => {
    if (!check || (mobileOnly && window.innerWidth >= 961)) return
    const frame = requestAnimationFrame(() => {
      const element = verdict.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0
      if (rect.top >= headerBottom + 16 && rect.bottom <= window.innerHeight) return
      element.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [check, verdict, mobileOnly])
}
