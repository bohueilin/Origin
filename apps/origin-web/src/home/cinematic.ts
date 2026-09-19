/** Decorative brand motion: opt-in with reduced motion, finite playback otherwise. */
const film = document.querySelector<HTMLVideoElement>('[data-cinematic-film]')
const toggle = document.querySelector<HTMLButtonElement>('[data-cinematic-toggle]')
if (film && toggle) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  const update = () => {
    toggle.textContent = film.ended ? 'Replay scene' : film.paused ? 'Play scene' : 'Pause scene'
    toggle.setAttribute('aria-pressed', String(!film.paused))
  }
  const unavailable = () => {
    film.pause()
    toggle.hidden = true
  }
  const play = () => {
    void film.play().catch((error: unknown) => {
      // Autoplay restrictions still allow a deliberate click. A terminal media
      // error leaves the poster as the finished visual, without a dead control.
      if (film.error || (error instanceof DOMException && error.name === 'NotSupportedError')) unavailable()
      else update()
    })
  }
  toggle.hidden = false
  film.addEventListener('error', unavailable)
  // With a <source> child, a failed download dispatches on that child and
  // does not bubble to the video element.
  film.querySelectorAll('source').forEach((source) => source.addEventListener('error', unavailable))
  film.addEventListener('play', update)
  film.addEventListener('pause', update)
  film.addEventListener('ended', update)
  toggle.addEventListener('click', () => {
    if (film.paused) play()
    else film.pause()
  })
  media.addEventListener('change', () => { if (media.matches) film.pause() })
  document.addEventListener('visibilitychange', () => { if (document.hidden) film.pause() })
  if (film.error) unavailable()
  else if (!media.matches) play()
}
