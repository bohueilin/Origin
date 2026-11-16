/**
 * Caption tray for the recorded demos: the active text-track cue shows in a tray under the
 * player, so the words never sit on the recorded interface. Since Release 7 (R05) the
 * recordings carry no caption in the picture, so this tray is the only place a cue shows.
 *
 * The track stays in the DOM for assistive technology, in mode 'hidden', so the browser's own
 * cue overlay never draws over the picture as well. Every cue is laid in the same grid cell
 * and only the active one is visible, so the tray is as tall as its longest cue from the
 * moment the track loads and a cue change never moves the page.
 */
import './captionTray.css'

document.querySelectorAll<HTMLElement>('[data-caption-tray]').forEach((tray) => {
  const video = tray.closest('figure')?.querySelector('video')
  const track = video?.textTracks[0]
  if (!video || !track) return
  const lines = new Map<TextTrackCue, HTMLElement>()

  const fill = () => {
    if (lines.size || !track.cues?.length) return
    for (const cue of Array.from(track.cues)) {
      const line = document.createElement('span')
      line.textContent = (cue as VTTCue).text
      lines.set(cue, line)
      tray.append(line)
    }
    show()
  }
  const show = () => {
    const active = new Set(Array.from(track.activeCues ?? []))
    lines.forEach((line, cue) => line.classList.toggle('is-on', active.has(cue)))
  }
  // Keep the native overlay off: if the player's captions menu turns the track on, the tray
  // already shows it.
  const hide = () => { if (track.mode !== 'hidden') track.mode = 'hidden' }

  hide()
  track.addEventListener('cuechange', () => { fill(); show() })
  video.querySelector('track')?.addEventListener('load', fill)
  video.textTracks.addEventListener('change', hide)
  fill()
})
