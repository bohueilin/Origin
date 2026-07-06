import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CircleCheck, CircleX } from 'lucide-react'

// The literal payoff the cinematic films can't show: the same customer message
// handled by the broken agent vs. the LoopForge-repaired agent, plus the queue
// of repeated failures draining to zero.
export function RepairMoment({ volume }: { volume: number }) {
  const [count, setCount] = useState(volume)
  const ref = useRef<HTMLElement>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(0)
      return
    }

    let raf = 0
    let cancelled = false

    const drain = () => {
      const start = performance.now()
      const duration = 1600
      const tick = (now: number) => {
        if (cancelled) return
        const t = Math.min(1, (now - start) / duration)
        const eased = 1 - Math.pow(1 - t, 3)
        setCount(Math.round(volume * (1 - eased)))
        if (t < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !startedRef.current) {
            startedRef.current = true
            drain()
          }
        })
      },
      { threshold: 0.4 },
    )
    io.observe(el)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [volume])

  return (
    <section className="repair-moment" ref={ref} aria-labelledby="rm-title">
      <div className="repair-moment-head">
        <p className="section-kicker">Before → After</p>
        <h2 id="rm-title">The same customer, one repair apart.</h2>
      </div>

      <div className="repair-moment-grid">
        <div className="rm-chats">
          <article className="rm-chat bad">
            <span className="rm-tag bad">
              <CircleX size={13} aria-hidden="true" />
              Before — broken agent
            </span>
            <p className="rm-bubble customer">
              I canceled StreamBox Plus last month and got charged again this morning.
            </p>
            <p className="rm-bubble agent bad">I'm escalating you to a human specialist.</p>
            <span className="rm-outcome bad">Over-escalated · customer bounced</span>
          </article>

          <div className="rm-arrow" aria-hidden="true">
            <ArrowRight size={20} />
          </div>

          <article className="rm-chat good">
            <span className="rm-tag good">
              <CircleCheck size={13} aria-hidden="true" />
              After — LoopForge-repaired
            </span>
            <p className="rm-bubble customer">
              I canceled StreamBox Plus last month and got charged again this morning.
            </p>
            <p className="rm-bubble agent good">
              I confirmed the cancellation and the duplicate posted charge, filed the dispute, and
              credited you while it's reviewed. Resolved.
            </p>
            <span className="rm-outcome good">Resolved on first contact</span>
          </article>
        </div>

        <div className="rm-queue" role="img" aria-label={`Support queue draining from ${volume} to zero`}>
          <span className="rm-queue-label">Support queue</span>
          <strong className="rm-count">{count}</strong>
          <span className="rm-queue-sub">repaired agents clearing the backlog</span>
        </div>
      </div>
    </section>
  )
}
