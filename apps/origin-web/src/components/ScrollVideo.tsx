// A reference film that holds a still poster until it scrolls into view, then
// mounts a muted, looping, non-interactive YouTube embed. This keeps the page's
// motion budget low (only the hero film autoplays immediately) and improves load.
// Honors prefers-reduced-motion by never autoplaying — the poster stays.

import { useEffect, useRef, useState } from 'react'

export function ScrollVideo({ id, title }: { id: string; title: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const src = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${id}&controls=0&rel=0`

  return (
    <div className="phone-shell" ref={ref}>
      <div className="phone">
        <span className="phone-notch" aria-hidden="true" />
        {active ? (
          <iframe
            src={src}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <img
            className="phone-poster"
            src={`https://img.youtube.com/vi/${id}/maxresdefault.jpg`}
            alt={title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`
            }}
          />
        )}
      </div>
    </div>
  )
}
