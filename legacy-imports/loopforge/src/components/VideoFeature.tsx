import { useEffect, useRef, type ReactNode } from 'react'

type VideoFeatureProps = {
  src: string
  poster?: string
  kicker: string
  title: ReactNode
  caption?: string
  reverse?: boolean
  lazy?: boolean
  children: ReactNode
}

export function VideoFeature({ src, poster, kicker, title, caption, reverse, lazy, children }: VideoFeatureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  // Below-the-fold films load and play only when scrolled near, so the live
  // Cerebras run and first paint win the bandwidth on load.
  useEffect(() => {
    if (!lazy) return
    const v = videoRef.current
    if (!v) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            v.play().catch(() => {})
          } else {
            v.pause()
          }
        })
      },
      { threshold: 0.25 },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [lazy])

  return (
    <section className={reverse ? 'video-feature reverse' : 'video-feature'}>
      <figure className="video-feature-media">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          autoPlay={!lazy}
          preload={lazy ? 'none' : 'metadata'}
        />
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
      <div className="video-feature-copy">
        <p className="section-kicker">{kicker}</p>
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  )
}
