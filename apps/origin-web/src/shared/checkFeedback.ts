import { useEffect, type RefObject } from 'react'

export function checkStamp(startedAt: number) {
  const now = new Date()
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map(value => String(value).padStart(2, '0')).join(':')
  return {
    time,
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
  }
}

export function useCheckVisibility(check: object | number | null, verdict: RefObject<HTMLElement | null>, mobileOnly = true) {
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
