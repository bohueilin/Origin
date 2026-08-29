/**
 * Video band — plays a short atmospheric clip once, when it is actually on screen.
 *
 * A band carries one of two tiers, and its pill says which in plain words: generated
 * atmosphere ("Illustration", pill--ill) or an unedited recording of the product itself
 * ("Recorded", pill--rec). On a site whose entire argument is that it does not dress one
 * kind of evidence up as another, an unlabelled clip beside real verdicts would be the
 * single most expensive thing we could ship — so the label is not optional.
 *
 * Progressive enhancement only. With this module absent the band still works — the poster
 * shows and the native controls play it on click. All this adds is: start it once when it
 * scrolls into view, and only when the reader has not asked for reduced motion.
 *
 * Deliberately NOT a loop. Ambient repeating motion on a trust surface is the pattern
 * DESIGN_PRINCIPLES.md forbids; each clip runs once and holds its final frame.
 */

export function initVideoBands(): void {
  const videos = document.querySelectorAll<HTMLVideoElement>('video[data-band]')
  if (videos.length === 0) return

  // Reduced motion: leave the poster up. The clip is decorative, so the right
  // reduction is "do not start it", not "play it more gently".
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (!('IntersectionObserver' in window)) return

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const video = entry.target as HTMLVideoElement
        io.unobserve(video) // once per page load — scrolling back must not restart it
        video.play().catch(() => {
          /* autoplay policy refused; the poster and the controls stand */
        })
      }
    },
    // 45% keeps it from firing on a band only just clipping the viewport edge.
    { threshold: 0.45 },
  )

  for (const video of videos) io.observe(video)
}

initVideoBands()
